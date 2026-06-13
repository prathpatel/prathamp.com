---
title: "AI-Powered Meeting Analyser"
description: "NLP-powered meeting intelligence platform that automates transcription, summarization, and action item extraction with an event-driven pipeline, saving 3+ hours weekly per user."
tech: [Python, FastAPI, AssemblyAI API, OpenAI API, Celery, Redis, PostgreSQL, Selenium, Docker, Google Calendar API, Google Drive API]
featured: true
---

## Overview

Built an AI-powered meeting intelligence platform that eliminates the post-meeting documentation tax. The system ingests meeting audio, transcribes it with speaker diarization, then runs a multi-stage NLP pipeline to produce structured summaries, decisions, and assigned action items — automatically pushing the output into the tools teams already live in (Google Drive and Google Calendar).

The platform was designed around a simple thesis: **the most valuable part of a meeting happens after it ends, and almost nobody does it well.** Notes are inconsistent, action items get lost, and follow-ups slip. By turning every recorded conversation into a reliable, searchable, structured artifact, the tool saved each user **3+ hours per week** and recovered roughly **30 minutes of admin time per meeting**, while reliably surfacing **10+ action items per meeting** at around **80% extraction accuracy** against human-labeled benchmarks.

---

## The Problem

Knowledge work runs on meetings, but meetings produce almost nothing durable on their own. The typical workflow looks like this: someone half-listens while typing notes, the notes are incomplete and biased toward what that one person cared about, action items live in a Slack message that gets buried, and two weeks later nobody can agree on what was actually decided.

The manual post-meeting workflow has a predictable shape, and every step is a place where information leaks:

- **Note-taking during the meeting** — the note-taker is a worse participant, and the notes are still incomplete.
- **Cleaning up notes afterward** — turning fragments into something readable takes 15–30 minutes.
- **Extracting action items** — who owns what, by when, gets lost in prose.
- **Distributing follow-ups** — manually creating calendar events and reminders.
- **Filing the artifact** — dropping a doc somewhere it can actually be found later.

We wanted to collapse all of that into a single automated pipeline that fires the moment a meeting ends. The user does nothing. The output shows up in their Drive and their calendar.

---

## System Architecture

The platform is built as an **event-driven, asynchronous processing pipeline**. The core design constraint was that transcription and LLM inference are slow and variable — anywhere from seconds to several minutes — so the system could never be a synchronous request/response service. Instead, every meeting flows through a job queue, with each stage emitting events that trigger the next.

| Component | Responsibility |
| --------- | ------------- |
| **Ingestion API** | Accepts audio uploads / recording webhooks, validates, persists raw media |
| **Job Orchestrator** | Celery-based task queue coordinating the multi-stage pipeline |
| **Transcription Service** | Wraps AssemblyAI for speech-to-text with speaker diarization |
| **NLP Engine** | Multi-prompt OpenAI pipeline for summarization, decisions, and action items |
| **Enrichment Layer** | Resolves speakers to people, links action items to owners |
| **Integration Service** | Pushes artifacts to Google Drive and Calendar via Selenium + APIs |
| **Metadata Store** | PostgreSQL store for meetings, transcripts, jobs, and extracted entities |

The services communicate through **Redis** as both the Celery broker and a fast cache, with **PostgreSQL** as the durable system of record. The entire stack is containerized with **Docker** for reproducible deployment.

---

## Ingestion: Getting Audio Into the Pipeline

Meeting audio arrives one of two ways. The first is a direct upload — a user drops a recording file through the **Ingestion API**, a FastAPI service that validates the media format, computes a content hash for deduplication, and streams the file to object storage. The second path is automated capture: a **Selenium-driven recording bot** joins scheduled calls, captures the audio stream, and hands the file off to the same ingestion endpoint when the meeting ends.

Once the raw media lands, the Ingestion API creates a **Meeting record** in PostgreSQL with a status of `queued`, writes the storage pointer, and enqueues the first pipeline task in Celery. From this point on, everything is asynchronous — the user gets an immediate acknowledgment, and the heavy work happens in the background.

A small but important detail: every meeting carries a **correlation ID** that threads through every downstream stage. When something fails three stages deep in the pipeline, that ID is what lets us trace the failure back to the source audio without grepping logs blind.

---

## Transcription: Speech to Structured Text

The **Transcription Service** wraps the **AssemblyAI API**. Rather than treating transcription as a single black-box call, the service is responsible for turning raw audio into a structured, speaker-attributed transcript that the rest of the pipeline can reason about.

### Diarization and Speaker Mapping

Raw transcription gives you words; it doesn't tell you *who said what*. The service enables **speaker diarization**, which segments the transcript into utterances attributed to anonymous speakers (`Speaker A`, `Speaker B`). The Enrichment Layer later resolves these labels to real participants by cross-referencing the calendar invite's attendee list and, where available, voice-print hints from prior meetings.

### Handling Real-World Audio

Meeting audio is messy — crosstalk, background noise, people joining mid-sentence, the dreaded "you're on mute." The service applies a few defensive measures: it submits audio with **disfluency filtering** disabled during the first pass (so the NLP engine can see hesitations that sometimes signal uncertainty in decisions), then normalizes timestamps so utterances can be aligned to a single meeting timeline even when the recording has gaps. Confidence scores from AssemblyAI are preserved per-segment and propagated downstream — low-confidence spans are flagged so the summarization stage can hedge appropriately rather than confidently hallucinating over garbled audio.

The structured transcript — utterances, speakers, timestamps, and confidence — is written back to PostgreSQL and the pipeline advances to NLP processing.

---

## The NLP Engine: From Transcript to Insight

This is the core of the platform. A raw transcript is not useful — a 45-minute meeting produces ~7,000 words of text that nobody will read. The **NLP Engine** transforms that wall of text into three structured outputs: a **summary**, a set of **decisions**, and a list of **action items** with owners.

### Why a Multi-Stage Pipeline Instead of One Prompt

The naive approach is to dump the whole transcript into a single prompt and ask for "a summary and action items." This fails in predictable ways: long transcripts blow the context window, the model conflates discussion with decisions, and action items come back vague ("follow up on the thing"). Instead, the engine runs a **staged, multi-prompt pipeline**, where each stage has one job and feeds the next.

**Stage 1 — Chunking & Map-Reduce Summarization.** The transcript is split into semantically coherent chunks along topic and speaker-turn boundaries (not naive fixed-size windows, which cut sentences in half). Each chunk is summarized independently (the *map* step), then the chunk summaries are combined into a single coherent meeting summary (the *reduce* step). This keeps every individual call comfortably inside the context window and produces summaries that hold together across a long meeting.

**Stage 2 — Decision Extraction.** A dedicated prompt scans the transcript specifically for *decisions* — points where the group committed to a course of action — and distinguishes them from open discussion. The prompt is given the rule that "we should probably..." is not a decision but "we're going with option B" is. Each decision is extracted with the supporting context and the speaker who articulated it.

**Stage 3 — Action Item Extraction.** The highest-value and hardest stage. A structured prompt extracts action items as typed objects: `{ task, owner, due_date, source_quote }`. The `source_quote` field is critical — it grounds every extracted item in an actual line from the transcript, which both improves accuracy and gives users a way to verify the item wasn't hallucinated. The owner is resolved against the meeting's attendee list; when ownership is ambiguous ("someone should look into this"), the item is flagged as **unassigned** rather than guessed.

**Stage 4 — Validation & Structuring.** All outputs are coerced into a strict JSON schema and validated. Malformed responses trigger a single constrained retry with the schema re-injected. Items whose `source_quote` can't be matched back to the transcript are dropped — this is the main defense against hallucinated action items, and it's the single change that moved extraction accuracy from "interesting demo" to "actually trustworthy."

### Grounding and Anti-Hallucination

The recurring theme across every stage is **grounding outputs in the source transcript**. Summaries are built bottom-up from real text rather than top-down from the model's priors; decisions and action items must cite a supporting quote; anything that can't be traced back is discarded. This is what gets the platform to ~80% extraction accuracy without the failure mode that kills trust — confidently inventing a task nobody agreed to.

---

## Enrichment: Resolving People and Ownership

Between raw NLP output and a useful artifact sits the **Enrichment Layer**. Its job is to turn anonymous, loosely-attributed extractions into things tied to real people and real dates.

It resolves diarization labels (`Speaker A`) to named attendees by joining against the calendar invite. It normalizes relative due dates ("by end of next week") into absolute dates using the meeting's date as the anchor. And it deduplicates action items that were restated multiple times across a long meeting — a common artifact of the map-reduce summarization, where the same commitment surfaces in two adjacent chunks.

The output of this stage is a clean, fully-resolved meeting artifact ready to be pushed into downstream tools.

---

## Integration: Closing the Loop

Extraction is worthless if the output dies in a database. The **Integration Service** is what makes the platform feel magic — the artifacts show up where people already work, with zero manual effort.

### Google Drive

On completion, the service generates a formatted meeting document — title, attendees, summary, decisions, and a checklist of action items with owners and due dates — and writes it to **Google Drive** via the Drive API, filed into a per-team folder structure. The document links back to the source transcript so anyone can audit a summary against what was actually said.

### Google Calendar

For each action item with a due date, the service creates a **Google Calendar** reminder event assigned to the owner, with the task description and a deep link back to the source meeting doc. This is the step that actually changes behavior: an action item that lives in a doc gets forgotten; one that shows up as a calendar event the day before it's due gets done.

### Selenium for the Gaps

Not every system the platform needs to touch has a clean API — internal tools and certain meeting platforms don't. For those, the Integration Service falls back to **Selenium** automation to drive the UI directly: logging in, navigating, and depositing artifacts where they belong. It's not elegant, but it's what makes the platform work end-to-end in real, messy enterprise environments rather than only in the happy path.

---

## Reliability & Operations

Because the pipeline is long and depends on external APIs that fail in interesting ways, reliability was a first-class concern.

**Idempotency** — Every stage is idempotent and keyed on the meeting's correlation ID, so a retried job never produces duplicate documents or duplicate calendar events.

**Retry with backoff** — Transient failures from AssemblyAI or OpenAI (rate limits, timeouts) are retried with exponential backoff inside Celery. Permanent failures (corrupt audio, auth errors) are dead-lettered for inspection rather than retried forever.

**Partial success** — A meeting that transcribes successfully but fails at action-item extraction still produces and files a summary. Users get the most value the pipeline can deliver rather than an all-or-nothing failure.

**Cost control** — LLM calls are the dominant cost. Chunk summaries are cached by content hash, so re-processing a meeting (e.g., after fixing an enrichment bug) doesn't re-pay for summarization that hasn't changed.

---

## Tech Stack Summary

| Layer | Technologies |
| ----- | ------------ |
| **API & Orchestration** | Python, FastAPI, Celery, Redis |
| **Transcription** | AssemblyAI API (speech-to-text, diarization) |
| **NLP / LLM** | OpenAI API (map-reduce summarization, extraction) |
| **Automation** | Selenium, Google Calendar API, Google Drive API |
| **Storage** | PostgreSQL, object storage for raw media |
| **Infrastructure** | Docker |

---

## Results

- **3+ hours saved weekly per user** by eliminating manual note-taking, cleanup, and follow-up admin.
- **~30 minutes saved per meeting** through automated documentation and scheduling.
- **10+ action items extracted per meeting**, each grounded in a verifiable source quote.
- **~80% extraction accuracy** against human-labeled benchmarks, with hallucinated items suppressed by source-quote grounding.

---

## Lessons Learned

### 1. One Giant Prompt Doesn't Scale — Staged Pipelines Do

The single biggest quality jump came from breaking the work into a map-reduce summarization pass plus dedicated extraction stages. Asking a model to "do everything" produces mediocre everything. Giving each stage one narrow job produces outputs you can actually trust.

### 2. Grounding Beats Cleverness

The feature that made action-item extraction trustworthy wasn't a better model — it was forcing every extracted item to cite a real quote and dropping the ones that couldn't. Constraining the model to the source text mattered far more than prompt wording.

### 3. The Integration Is the Product

Users don't care about transcription accuracy in the abstract. They care that a reminder shows up on their calendar before the deadline. The last mile — pushing artifacts into Drive and Calendar — is what turned an interesting NLP demo into something people actually relied on.

### 4. Async From Day One

Building the system around a job queue from the start, rather than retrofitting async later, made every subsequent decision easier — retries, partial success, cost caching, and observability all fell out naturally from the event-driven design.
