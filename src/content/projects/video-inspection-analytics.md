---
title: "AI Video Inspection Analytics Pipeline"
description: "A distributed, GPU-accelerated video analysis pipeline that turns automotive service-inspection videos into structured insights — transcription, object detection, license-plate capture, audio quality, and LLM scoring — at scale on Kubernetes."
tech: [Python, Ray, Redis, BullMQ, KEDA, PyTorch, RT-DETR v2, Ultralytics YOLO, OpenCV, FFmpeg, OpenAI Whisper, GPT-4o, Google Vertex AI Gemini, Ollama, NLTK, PostgreSQL, AWS EKS, AWS Lambda, S3, CloudWatch, Docker, Azure Pipelines, PostHog]
featured: true
---

## Overview

This is a **distributed video analytics service** that ingests automotive service-inspection videos and processes them through a multi-stage AI/ML pipeline — extracting metadata, transcribing speech, analyzing audio quality, detecting objects and license plates, checking for keywords and profanity, and generating LLM-based summaries. Each video enters as a job on a Redis-backed **BullMQ** queue, is picked up by a **BullMQ worker** (the queue consumer that is the app's entry point), and flows through a **Ray**-orchestrated workflow that fans dozens of CPU- and GPU-bound tasks out across a pool of persistent **`VideoWorker` actors** (the processes that do the actual video work).

> **A note on the word "worker."** It means three different things in this system, so this post is explicit about which one every time: the **BullMQ worker** pulls jobs off the Redis queue; the **`VideoWorker` actors** are the Ray processes that process a video; and the separate ingestion pipeline uses **Chrome/HTTP download threads** it also calls "workers." Unless qualified, "worker" below always means a `VideoWorker` actor.

The system is built for **throughput under tight memory budgets**. A single video can spawn 15+ parallel tasks — Whisper transcription, RT-DETR object detection, FFmpeg metadata extraction, a custom muffled-audio classifier, license-plate selection, thumbnail upload — all coordinated on one GPU node without blowing the memory ceiling. It runs on **Amazon EKS** with **KEDA** scaling pods to zero when the queue is empty and out to eight when it backs up, and it is deployed continuously through **Azure Pipelines** into both staging and production clusters.

The domain is **automotive dealership service inspections**: a technician records a walkaround video while servicing a vehicle, and the pipeline scores it — was the customer greeted, is the license plate visible, which parts (tire, brake, air filter, battery) were shown, is the audio audible, is the camera stable. A **brand-specific plugin architecture** lets the same engine ship customized detection logic per OEM customer while falling back to sensible defaults.

---

## The Problem

A raw inspection video is opaque. Buried inside a two-minute clip is everything a dealership cares about — did the technician follow the script, is the vehicle's plate captured for the record, which components were actually inspected, is the recording even usable. Doing this by hand doesn't scale to the volume of videos a service network produces every day.

The technical problem is harder than "run a model on a video." Video processing is **memory-hostile**: decoding frames, loading torch models, running Whisper, and holding Ray object references all compete for RAM, and a single leak compounds across thousands of jobs until the pod is OOM-killed. So the real challenge was building a pipeline that is simultaneously **highly parallel** (to hit throughput targets), **memory-disciplined** (to survive long-running production), and **extensible** (to onboard new OEM brands without forking the codebase).

---

## Pipeline Architecture

The service is a **single distributed application** built around a Ray actor pool, with each concern isolated into its own module. Jobs are consumed from a queue, orchestrated through a central workflow, and executed across leased worker actors.

| Component | Responsibility |
| --------- | ------------- |
| **BullMQ Worker** (`async_bullmq.py`) | Consumes jobs from Redis queues, fair-shuffles work, bootstraps Ray |
| **Workflow Orchestrator** (`analytics.py`) | `video_preprocessing_workflow()` — Ray-driven stage coordination |
| **Task Layer** (`tasks.py`) | Ray remote tasks + the persistent `VideoWorker` actor |
| **Worker Manager** (`worker_manager.py`) | Pool of `VideoWorker` actors, leasing, recycling, zombie cleanup |
| **Inference Engine** (`object_detection/`) | Shared GPU actor running RT-DETR v2 behind a batch queue |
| **Plugin System** (`plugins/`, `modular_plugin_setup.py`) | Per-brand detection/keyword logic with default fallback |
| **Ingestion Cron** (`SFTP_cron/`) | Pulls vendor video CSVs over SFTP and stages them into S3 |

Everything runs on **AWS**, with PostgreSQL (RDS) for state, ElastiCache Redis for queues, S3 for video and model storage, and Lambda for offloaded audio math.

---

## The Ray Worker Pool (`VideoWorker` actors)

The heart of the system is a **custom actor-based pool of `VideoWorker` actors** built on Ray 2.24.0, designed to amortize the cost of loading heavy libraries while keeping memory under control. (This is distinct from the single BullMQ worker that feeds jobs in; everything in this section is about the `VideoWorker` actors that process them.)

A singleton **`WorkerManager`** actor maintains the pool of persistent **`VideoWorker`** actors (default up to six, configurable via `MAX_RAY_WORKERS`). `VideoWorker`s are created **lazily** — the pool starts at zero to avoid holding RAM while idle, and one is only spun up when a job arrives. A background monitor thread watches activity and, after an idle timeout, **kills all `VideoWorker`s to free memory**, putting the manager to sleep until the next job.

Each `VideoWorker` pre-loads the expensive dependencies — torch, YOLO, the muffled-audio model, brand plugins — once at startup, then handles many videos without paying that cost again. To prevent the memory fragmentation that inevitably builds up in a long-lived Python process, **a `VideoWorker` is recycled (killed and replaced with a fresh one) every 3 videos** — or earlier if it is already over 90% memory. The workflow leases a `VideoWorker` via `get_idle_worker()` and returns it via `return_worker()` when done.

Memory discipline is enforced everywhere:

- The Ray **object store is capped at 2 GB** and uses `/dev/shm` shared memory in Kubernetes.
- Every heavy task is wrapped in a **`@memory_managed_task`** decorator that snapshots memory before and after and forces `gc.collect()`.
- After each video, the orchestrator explicitly deletes Ray object references — the largest leak point, since 10+ task handles otherwise linger in the plasma store — and runs an aggressive cleanup.
- A `malloc_trim(0)` call via `ctypes` forces the OS to actually reclaim freed memory.
- The `WorkerManager` hunts down and **kills zombie processes** (FFmpeg, Chrome) left behind by crashed subtasks.

---

## The Processing Stages

When `video_preprocessing_workflow()` picks up a job, it leases a `VideoWorker` and drives the video through staged, heavily parallelized work. Progress is written back continuously — each stage has a configurable weight (e.g. download = 10%, objects = 10%) and pushes status updates through a central `UpdateAPI`, with intermediate state cached in Redis and persisted to PostgreSQL.

**1 — Download & Setup.** The video is pulled from S3 into a per-UUID working directory. A Redis-backed **cancellation check** (`raise_if_media_cancelled`) runs at every checkpoint, so a job cancelled mid-flight halts immediately instead of wasting GPU time.

**2 — Metadata Extraction.** FFprobe extracts audio/video stream features (codecs, duration), checks for embedded subtitle tracks, and the audio track is demuxed to MP3/WAV. A **camera-stability analyzer** estimates motion with sparse Lucas-Kanade optical flow + RANSAC (with a GPU Farneback fallback) and scores frame blur via variance-of-Laplacian.

**3 — Audio Analysis.** Run in parallel: OpenAI **Whisper** (`whisper-1`) for speech-to-text with word-level timestamps; a custom **muffled-audio classifier** (a torch model over 128-bin mel-spectrograms resized to 224×224, thresholded at 0.999); FFmpeg **silence detection** (`silencedetect`) and **volume analysis** (`volumedetect`, with the heavy math offloaded to a Lambda); plus voice-activity detection and words-per-minute calculation. The Whisper layer also does hallucination cleanup and low-WPM verification to reject garbage transcripts.

**4 — Transcription Analysis.** Once text exists: **keyword checking** with NLTK (WordNet synonym/lemma expansion against a brand keyword list), **profanity screening**, **language detection**, **car-model and dealer-name extraction** via GPT-4o, and an LLM summary service that scores the inspection against a dealership checklist (greeting, washer top-off, tire pressure, service-indicator reset, next steps, sign-off).

**5 — Image Analysis.** Sampled frames run through **RT-DETR v2** object detection. To kill flicker, a label only counts if it **persists across at least 3 frames**, and detected classes are normalized through a mapping table ("tires" → "tire"). License-plate capture uses a **three-tier best-frame selection** (license plate > car > any detection, each by highest confidence), and the best frames become uploaded thumbnails.

**6 — Cleanup.** Working files are removed, every Ray reference is dropped, peak memory/GPU stats are logged, and per-stage timings are aggregated for observability.

---

## The Inference Engine

Object detection deserved its own design because GPU memory is the scarcest resource on the node. Rather than each `VideoWorker` loading its own copy of RT-DETR, the system uses a **shared, model-agnostic inference actor**.

The **`InferenceEngine`** is a Ray actor with a **model registry** — adding a new detector is a two-step change: drop a wrapper class implementing `load()`/`predict()` into `object_detection/`, and register its string name. Today the registry maps `RTDETRV2` to the `RTDETRV2Model` wrapper, which owns all the RT-DETR-specific setup, weight loading from environment variables, and the preprocess → forward-pass pipeline.

`VideoWorker`s don't call the model directly. They submit frame batches to a **`ModelBatchQueue`** — a FIFO that decouples producers (many `VideoWorker`s) from the single GPU consumer, routes results back by batch ID, and centralizes **post-processing** (confidence-threshold filtering, class-ID → label decoding). The engine polls the queue, runs inference, and **unloads the model after an idle timeout** so the GPU isn't held hostage during quiet periods.

---

## The Plugin System

Different OEM customers need different detection logic, but the pipeline plumbing is identical. The solution is a **dynamic, brand-scoped plugin architecture**.

Each functionality — object detection, license-plate detection, keyword checking — maps to a handler. A **`PluginManager`** loads the right implementation from `plugins/<brand>/` at runtime, driven by a `BRAND_FUNCTIONALITIES` map, and **falls back to `plugins/default/`** when a brand doesn't override a given handler. A brand directory ships files like `<brand>_object_detection.py` and `<brand>_license_plate_detect_v2.py`; the orchestrator invokes them generically through a single `modular_tasks_task()` entry point.

The payoff: onboarding a new brand means adding a directory and wiring it into the map — no changes to the workflow, the `VideoWorker` pool, or the inference engine.

---

## The Gen AI Layer

The pipeline blends **cloud and local models**, choosing each for fit:

- **OpenAI** — Whisper for transcription, **GPT-4o** for car-model/dealer extraction and transcript verification.
- **Google Vertex AI** — a **Gemini** client (`google-genai`) and Google Cloud Speech as an alternative vision/STT path.
- **Ollama** — a **local SLM** (`llama3.2:3b`) running as a sidecar, for inference that shouldn't leave the cluster or incur per-call API cost.

Every model call is **cost- and token-tracked**. A `calculate_cost()` table prices each model (per audio-minute for Whisper, per token for GPT), and usage is emitted both to **CloudWatch custom metrics** (a `VideoProcessing` namespace tracking total cost and tokens) and to **PostHog** via its `$ai_generation` event, giving a per-video, per-model spend breakdown.

---

## Ingestion: The SFTP Pipeline

Before a video can be analyzed it has to land in S3, and many come from third-party inspection vendors. A separate **cron pipeline** (`SFTP_cron/`) handles this.

It connects to a vendor SFTP server over **SSH-key auth**, downloads only CSVs it hasn't seen (tracked in a processed-files log), and routes each row by vendor. Browser-only sources are scraped with **6 parallel headless Chrome download threads** (this pipeline calls them "workers," but they are plain threads — unrelated to the `VideoWorker` actors above) that recover the underlying video URL three ways — console-log sniffing, triggering playback, then reading Chrome's CDP network log — and download via direct HTTP or **yt-dlp** for HLS streams. Direct-link vendors run through **10 parallel HTTP download threads**. Everything is re-uploaded to S3 under per-vendor prefixes, and a **bulk-import CSV** is emitted for the platform.

The pipeline is **fully resumable**: every processed video is appended to a results log, so an interrupted run picks up exactly where it left off without re-downloading or re-scraping.

---

## Infrastructure & Deployment

### Kubernetes on EKS

The service runs on **GPU nodes** (one `nvidia.com/gpu` per pod, ~11–12 vCPU and 32 GiB RAM) scheduled via a GPU node selector. The pod is more than the app container: an **init container** downloads ML models from S3 and stages the Google service-account credentials, and an **Ollama init/sidecar** pulls the local LLM (`llama3.2:3b`) onto a **persistent volume** so model weights survive restarts.

### Queue-Driven Autoscaling

Scaling is **event-driven via KEDA**, keyed on Redis/BullMQ queue depth:

- **Scale to zero** when there's no work — no idle GPU cost.
- **Scale out to 8** replicas under load.
- Conservative, cost-aware policies: a 15-minute stabilization window and capped step-ups on the way up, faster scale-down, and a 900-second cooldown so pods don't thrash.

### CI/CD

**Azure Pipelines** drive continuous delivery for both environments: build the Docker image, push to **ECR** (`us-east-1`), and roll it out to the **EKS** cluster — with separate production and staging pipelines, configmaps, and KEDA definitions. Code quality is gated through **SonarQube**.

### Observability

The system is instrumented end-to-end. Logs fan out to **rotated local files and CloudWatch** in a consistent format; **CloudWatch custom metrics** track AI cost and token usage; **PostHog** records every LLM generation; an **EC2 tracker** maps each video to the instance that processed it in PostgreSQL; and `memory_monitor.py` / `resource_monitor.py` log per-stage memory and peak GPU utilization for every job. A standalone **queue-health checker** inspects BullMQ and Redis counter state.

---

## Tech Stack Summary

| Layer | Technologies |
| ----- | ------------ |
| **Orchestration** | Ray (actor pool), BullMQ over Redis |
| **Computer Vision** | RT-DETR v2, Ultralytics YOLO, OpenCV, PyTorch, FFmpeg |
| **Audio / Speech** | OpenAI Whisper, custom torch mel-spectrogram classifier, webrtcvad, librosa |
| **NLP** | NLTK (WordNet), langdetect, alt-profanity-check |
| **Gen AI** | OpenAI GPT-4o, Google Vertex AI Gemini, Ollama (llama3.2:3b) |
| **Data / State** | PostgreSQL (RDS), Redis (ElastiCache), S3 |
| **Infrastructure** | AWS EKS (GPU nodes), Lambda, ECR, Secrets Manager, Docker |
| **Scaling & CI/CD** | KEDA (queue-driven, scale-to-zero), Azure Pipelines, SonarQube |
| **Observability** | CloudWatch (logs + metrics), PostHog, custom memory/EC2 trackers |
| **Ingestion** | Paramiko (SFTP), Playwright/Chrome, yt-dlp, boto3 |

---

## Lessons Learned

### 1. In Video Processing, Memory Is the Architecture

Almost every design decision — lazy `VideoWorker` creation, recycling a `VideoWorker` every 3 videos, the 2 GB object-store cap, explicit reference deletion, `malloc_trim`, zombie-process reaping — exists to fight memory. A naive "load model, process video" loop dies in production within hours. The hard engineering wasn't the ML; it was keeping a long-running Python process alive under sustained load.

### 2. Amortize Expensive Loads, but Recycle Before They Rot

Persistent `VideoWorker` actors that pre-load torch and YOLO once are dramatically faster than cold-starting per job. But a process that lives forever fragments its heap. Recycling each `VideoWorker` on a fixed cadence (every 3 videos) captured the speedup of warm actors without the slow death of an immortal one.

### 3. Decouple Producers From the GPU

Letting every `VideoWorker` touch the GPU directly is a recipe for contention and duplicated model loads. A shared inference actor fronted by a batch queue made GPU usage predictable, allowed the model to unload when idle, and put all post-processing in exactly one place.

### 4. Plugins Turn Customers Into Config

A brand-scoped plugin system with a default fallback meant onboarding a new OEM was a directory and a map entry — not a fork. The pipeline core never changes; only the per-brand logic does.

### 5. Track Cost Where the Money Is Spent

Mixing Whisper, GPT-4o, Gemini, and a local SLM makes spend invisible unless you measure it. Pricing every call and emitting it to both CloudWatch and PostHog turned AI cost from a monthly surprise into a per-video, per-model number — and justified pushing eligible work onto the local model.
