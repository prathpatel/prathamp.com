---
title: "SQL Agent"
description: "Autonomous text-to-SQL agent that converts natural language into validated, executable queries over a live PostgreSQL warehouse — letting non-technical teams self-serve reports in minutes instead of waiting hours on analysts."
tech: [Python, SQL, LangChain, OpenAI API, PostgreSQL, FastAPI, Redis, pgvector, Git]
featured: true
---

## Overview

Built an autonomous **text-to-SQL agent** that turns plain-English business questions into correct, executable SQL against a live PostgreSQL data warehouse. The goal was to dissolve the bottleneck that exists in almost every data-driven org: business users have questions, the answers live in the database, and the only people who can get them out are a handful of overloaded analysts.

The agent democratizes data access without sacrificing safety. Marketing and sales teams ask questions in natural language; the agent inspects the schema, reasons about the right joins and filters, generates SQL, validates and executes it against a read-only replica, and returns formatted results — all in the time it takes to type a sentence. In production it achieved a **75% query success rate** across **100+ complex real-world queries**, and meaningfully **reduced the analyst backlog** by letting teams self-serve the long tail of ad-hoc reporting requests.

---

## The Problem

Every organization with a data warehouse has the same traffic jam. Business users — marketers, salespeople, ops — have a constant stream of questions: *"What was our cost-per-acquisition by channel last quarter?"*, *"Which campaigns drove the most signups in the SMB segment?"* The answers are sitting in PostgreSQL. But getting them out requires writing SQL, which requires an analyst, and analysts are a shared, finite resource.

So a question that should take 90 seconds to answer becomes a Jira ticket that sits in a queue for two days. The analyst context-switches away from real work to write a one-off query, the requester has often forgotten why they needed it by the time it lands, and the whole loop repeats for the next ad-hoc question. The cost isn't just analyst time — it's every decision that gets made on gut feel because pulling the data was too much friction.

Naive text-to-SQL — pipe the question and the schema into an LLM and run whatever comes back — is dangerous and unreliable. It hallucinates table and column names, writes queries that are syntactically valid but semantically wrong, ignores business logic (what does "active customer" actually mean?), and in the worst case runs destructive or runaway queries against production. The hard part isn't generating SQL — it's generating SQL you can *trust enough to execute automatically*.

---

## System Architecture

The agent is built as an **iterative, tool-using reasoning loop** rather than a single LLM call. The core insight is that good SQL generation mirrors how a human analyst actually works: look at the schema, recall what the tables mean, draft a query, sanity-check it, run it, and if it errors, read the error and fix it. The agent is structured as a **LangChain agent** that follows exactly this loop, with a set of tools it can invoke.

| Component | Responsibility |
| --------- | ------------- |
| **Query API** | FastAPI entry point; accepts NL questions, returns results |
| **Schema Indexer** | Introspects the DB and builds a semantic, searchable schema catalog |
| **Retrieval Layer** | pgvector-backed semantic search over schema + few-shot examples |
| **Reasoning Agent** | LangChain agent orchestrating the generate → validate → execute loop |
| **SQL Validator** | Static analysis and safety guardrails before any query runs |
| **Execution Engine** | Runs validated SQL against a read-only replica with strict limits |
| **Result Formatter** | Shapes raw rows into readable tables, summaries, or chart-ready data |

**Redis** caches schema metadata and recent query results; **PostgreSQL** (with **pgvector**) serves both as the warehouse and the store for the semantic schema index.

---

## Schema Understanding: Teaching the Agent the Database

The single biggest lever on accuracy is **how well the agent understands the schema**. You cannot just paste a 200-table schema into the prompt — it blows the context window and drowns the relevant tables in noise. The agent solves this with a dedicated schema-understanding subsystem.

### Schema Indexing

On startup (and on a refresh schedule), the **Schema Indexer** introspects PostgreSQL's information schema to catalog every table, column, type, primary/foreign key, and index. But raw structure isn't enough — `cust_t.acq_dt` means nothing to an LLM. So the catalog is **semantically enriched**: each table and column gets a natural-language description (curated where it matters, LLM-generated as a starting point), and foreign-key relationships are recorded as explicit, human-readable join paths ("`orders.customer_id` → `customers.id`").

### Retrieval-Augmented Schema Selection

When a question arrives, the agent doesn't see the whole schema. The **Retrieval Layer** embeds the question and runs **semantic search via pgvector** against the schema catalog to pull only the tables and columns likely relevant to *this* question. A query about "campaign signups" retrieves the `campaigns`, `signups`, and `channels` tables — not the entire warehouse. This keeps the prompt focused, fits comfortably in context, and dramatically cuts the rate of hallucinated table names.

The same retrieval layer surfaces **few-shot examples** — previously successful (question, SQL) pairs that resemble the current question — which the agent uses as templates. Over time, as more queries succeed, this example bank grows and the agent gets measurably better at the patterns specific to this business.

---

## The Reasoning Loop: How a Query Gets Built

The agent doesn't generate SQL in one shot. It runs an iterative loop, and the willingness to **read its own errors and retry** is what carries the success rate from "coin flip" to 75%.

**1. Intent parsing.** The agent first restates the question in structured terms — what metric, what dimensions, what filters, what time range — and resolves ambiguous business language. "Active customers" gets mapped to the defined business rule (e.g., a purchase in the last 90 days) pulled from the enriched schema metadata, rather than guessed.

**2. Schema grounding.** Using the retrieved tables and join paths, the agent identifies exactly which tables and columns it needs and how they connect. Grounding the generation in retrieved, real schema elements — rather than the model's memory of "typical" schemas — is the main defense against hallucinated identifiers.

**3. SQL generation.** With intent and grounded schema in hand, the agent generates a candidate query, including the joins, filters, aggregations, and grouping implied by the parsed intent.

**4. Validation (before execution).** The candidate passes through the **SQL Validator** — see below. If it fails a guardrail, the failure reason is fed back into the agent, which revises the query.

**5. Execution & error-driven repair.** The validated query runs against the read-only replica. If PostgreSQL returns an error (a genuinely wrong column, a type mismatch), the agent reads the actual error message and generates a corrected query — typically resolving it within one or two iterations. This self-correction loop is the difference between an agent that gives up on the first error and one that behaves like an analyst debugging their own SQL.

**6. Result formatting.** Successful results are handed to the formatter for presentation.

---

## Safety: The Validator and Execution Guardrails

Letting an LLM run SQL against a database automatically is only acceptable because of the guardrails that sit between generation and execution. Safety here is not a feature — it's the precondition for the entire product existing.

### Static Validation

Before any query executes, the **SQL Validator** parses the candidate into an AST and enforces hard rules: **read-only only** — `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, and DDL are rejected outright; **no unbounded scans** — queries without a `LIMIT` on large tables have one injected; **referenced objects must exist** — every table and column in the query is checked against the live catalog, catching hallucinated identifiers before they ever hit the database; and **no obviously runaway joins** — cartesian products and missing join conditions are flagged.

### Execution Sandboxing

Validated queries run against a **read-only replica**, never the primary, so there is no path by which the agent can affect production data or write load. Each query runs under a **statement timeout** and a **row cap**, so a pathological query degrades into a clean, bounded error rather than a database-wide incident. Every executed query, its generating question, and its outcome are **logged** — this audit trail is both a debugging tool and the raw material that feeds the few-shot example bank.

---

## Result Formatting: From Rows to Answers

Raw result sets aren't answers. The **Result Formatter** shapes output to match the question: a single-number question ("how many signups last week?") returns a clean scalar with its unit; a breakdown question returns a formatted table; a trend question returns chart-ready series data. For larger result sets, the agent can also generate a one-line natural-language summary of what the data shows, so a non-technical user isn't left staring at 200 rows trying to find the takeaway.

---

## Tech Stack Summary

| Layer | Technologies |
| ----- | ------------ |
| **Agent & Orchestration** | Python, LangChain, OpenAI API |
| **API** | FastAPI |
| **Database** | PostgreSQL (read-only replica), SQL |
| **Retrieval** | pgvector (semantic schema + few-shot search) |
| **Caching** | Redis |
| **Tooling** | Git |

---

## Results

- **75% query success rate** across diverse, real-world business questions — answers that ran and were correct without analyst intervention.
- **100+ complex queries** processed in production, including multi-table joins, aggregations, and time-window analyses.
- **Reduced analyst dependency** — marketing and sales teams self-served the long tail of ad-hoc reporting, freeing analysts for higher-value work.
- **Faster decisions** — questions that previously took hours-to-days in a ticket queue were answered in the time it took to type them.

---

## Use Cases

- **Marketing reports** — campaign performance, channel attribution, cost-per-acquisition.
- **Sales analytics** — revenue, pipeline, and conversion metrics by segment and period.
- **Customer insights** — cohort behavior, retention, and segmentation analysis.
- **Ad-hoc queries** — the one-off "I just need to know X" questions that used to clog the analyst queue.

---

## Lessons Learned

### 1. Schema Retrieval Beats Schema Stuffing

The accuracy unlock wasn't a bigger model or a cleverer prompt — it was *not* showing the agent the whole schema. Retrieving only the relevant tables via semantic search cut hallucinated identifiers dramatically and kept the agent focused on the question at hand.

### 2. Let the Agent Read Its Own Errors

A single-shot generator is a coin flip. An agent that executes, reads the database's actual error message, and revises behaves like a real analyst debugging their SQL — and that self-correction loop is most of the gap between 50% and 75%.

### 3. Safety Is the Product, Not a Feature

Automatically executing LLM-generated SQL is only defensible because of the validator, the read-only replica, the timeouts, and the row caps. Those guardrails aren't overhead — they're the entire reason the system can be trusted to run unattended.

### 4. Every Successful Query Makes the Next One Better

Logging successful (question, SQL) pairs and retrieving them as few-shot examples turned the agent into a system that compounds. The more it's used, the more it learns the specific patterns and business definitions of this warehouse.

### 5. The Hard Part Was Never the SQL

Generating syntactically valid SQL is easy. Generating SQL that respects business definitions, joins the right tables, and refuses to do anything dangerous — that's the actual engineering, and almost none of it is the generation step itself.
