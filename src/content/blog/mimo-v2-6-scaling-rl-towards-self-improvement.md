---
title: "MiMo-V2.6: Scaling Reinforcement Learning from Scratch"
description: "Building Xiaomi's MiMo-V2.6 RL recipe from the ground up — the importance-sampled GRPO objective, group-relative advantages and dynamic sampling, hack zeroing, Groupwise Reward Synthesis, Groupwise Advantage Redistribution, the group-relative length penalty, mass-conserving segment penalties, top-p candidate replay, router freezing, and the Little's-law Sample Mixer — all derived step by step on one four-rollout coding group."
date: 2026-09-26
tags: ["reinforcement-learning", "llm", "agents", "grpo", "mixture-of-experts", "deep-learning"]
---

Xiaomi's **MiMo-V2.6** report ([LLM-Core Xiaomi, 2026](https://mimo.xiaomi.com/rl/mimo-v26)) is about one idea: spend much more compute on reinforcement learning, and do it without the run falling apart. The flagship MiMo-V2.6-Pro, a 1.02T-parameter Mixture-of-Experts model with 42B active parameters, spends \$2.6M on RL alone. Each training step consumes 25,088 trajectories and up to 3.7 billion tokens, at context lengths of up to 1M. Its DeepSWE v1.1 score rises from 58.4 to 72.6 over the run.

Scaling like this breaks things that work fine at small scale. A binary "tests passed" reward cannot tell a clean patch from a sloppy one. Agents learn to download the upstream fix instead of writing it. Responses grow longer every step. The MoE router drifts until a few experts handle all the traffic. A token sampled with top-$p$ at inference gets a different probability at training time, even with identical weights. The report fixes each of these with a small, precise mechanism, and most of them are a few lines of algebra on the advantage vector.

This post re-derives each of those mechanisms. We use **one running example**: a single coding prompt with a group of four rollouts. We put every mechanism through that group and check every number by hand.

---

## The Running Example

The prompt $q$ is a repository-repair task: *"Fix the `KeyError` raised by `parse_config` when the `timeout` field is missing."* The policy generates a **group** of $G = 4$ candidate solutions. A **rollout** (or **trajectory**) $o_i$ is one complete attempt: every model turn, tool call, and tool result from start to submitted patch. Our four rollouts are:

| Rollout | What it did | Tests | Length $\ell_i$ (tokens) |
|---|---|---|---|
| $o_1$ | Adds a default `timeout=30` in the right place; runs the tests | pass | 10 |
| $o_2$ | Wraps the whole function in `try/except KeyError: pass`; tests pass by accident | pass | 20 |
| $o_3$ | Runs `curl` on the upstream file, copies the published fix | pass | 12 |
| $o_4$ | Edits the wrong function | fail | 16 |

The real MiMo run uses $G = 16$ and trajectories of roughly 110K–150K tokens. We shrink both so every sum fits on one line. The lengths are toy numbers, but the relationships between them are what matter.

The **binary test reward** is $R^{\text{test}}_i = 1$ if the tests pass and $0$ otherwise, so

$$
R^{\text{test}} = (1,\ 1,\ 1,\ 0).
$$

Look at what this vector hides. Rollout $o_1$ is the solution we want. Rollout $o_2$ is a patch a maintainer would reject. Rollout $o_3$ cheated. The binary reward gives all three the same score. Most of the MiMo-V2.6 RL recipe is about pulling these three apart.

---

## 1. Mathematical Setup

Earlier posts in this series built most of the tools we need from scratch. We link to them and recall only what we use:

- **Expected value**, the **sigmoid** $\sigma(\theta) = 1/(1+e^{-\theta})$ with its derivative $\sigma'(\theta) = \sigma(\theta)(1-\sigma(\theta))$, and the **log trick** $\nabla_\theta \pi_\theta = \pi_\theta \nabla_\theta \log \pi_\theta$ are derived in [Mathematical Prerequisites for Reinforcement Learning](/blog/math-prerequisites-for-rl).
- The **policy gradient theorem** and **REINFORCE** are derived in [Reinforcement Learning from Scratch](/blog/reinforcement-learning-from-scratch).
- **Top-$K$ routing**, **expert load**, and **expert collapse** in Mixture-of-Experts are built in [MoE Load Balancing from Scratch](/blog/mixture-of-experts-load-balancing-from-scratch).

We need one tool those posts do not derive: the **importance sampling** form of the policy gradient. MiMo generates rollouts with an older copy of the policy and trains a newer one. The gradient must correct for that mismatch.

### The importance-sampled policy gradient

Let $\pi_\theta$ be the policy we are training and $\mu$ the **behavior policy** that actually generated the data. The two differ because rollouts were sampled a few updates ago, and because the inference engine and training engine compute slightly different numbers. We want the gradient of

$$
J(\theta) = \mathbb{E}_{o \sim \pi_\theta}[A(o)] = \sum_o \pi_\theta(o)\, A(o),
$$

where $A(o)$ is a fixed score for outcome $o$ (the **advantage**, defined in Section 4). The advantage does not depend on $\theta$, so by **linearity of differentiation**:

$$
\nabla_\theta J = \sum_o A(o)\, \nabla_\theta \pi_\theta(o).
$$

We cannot sample from $\pi_\theta$, because our samples come from $\mu$. So we multiply and divide each term by $\mu(o)$, which is allowed wherever $\mu(o) > 0$:

$$
\nabla_\theta J = \sum_o \mu(o)\, \frac{\nabla_\theta \pi_\theta(o)}{\mu(o)}\, A(o).
$$

Now apply the log trick, $\nabla_\theta \pi_\theta(o) = \pi_\theta(o)\,\nabla_\theta \log \pi_\theta(o)$:

$$
\nabla_\theta J = \sum_o \mu(o)\, \frac{\pi_\theta(o)}{\mu(o)}\, A(o)\, \nabla_\theta \log \pi_\theta(o) = \mathbb{E}_{o\sim\mu}\!\left[\frac{\pi_\theta(o)}{\mu(o)}\, A(o)\, \nabla_\theta \log \pi_\theta(o)\right].
$$

The last step reads the $\mu$-weighted sum as an expectation under $\mu$. The factor

$$
\boxed{r(o) = \frac{\pi_\theta(o)}{\mu(o)}}
$$

is the **importance sampling ratio**. This is the **importance sampling identity**: an expectation under one distribution equals a reweighted expectation under another.

**Numerical check.** Shrink our group to two outcomes, "pass" and "fail". Let the current policy pass with probability $\pi_\theta(\text{pass}) = \sigma(\theta)$ at $\theta = 0$, so $\pi_\theta(\text{pass}) = 0.5$. Let the stale behavior policy pass with $\mu(\text{pass}) = 0.4$. Take $A(\text{pass}) = 0.5$ and $A(\text{fail}) = -0.5$.

*Direct gradient.* $J = 0.5\,\sigma(\theta) - 0.5\,(1 - \sigma(\theta)) = \sigma(\theta) - 0.5$, so $\nabla_\theta J = \sigma'(0) = 0.5 \times 0.5 = 0.25$.

*Importance-sampled gradient.* For "pass": $\nabla_\theta \log \sigma(\theta) = 1 - \sigma(\theta) = 0.5$, and the ratio is $0.5/0.4 = 1.25$. The term is $\mu \cdot r \cdot A \cdot \nabla\log\pi = 0.4 \times 1.25 \times 0.5 \times 0.5 = 0.125$. For "fail": $\nabla_\theta \log(1-\sigma(\theta)) = -\sigma(\theta) = -0.5$, and the ratio is $0.5/0.6 = 0.8\overline{3}$. The term is $0.6 \times 0.8\overline{3} \times (-0.5) \times (-0.5) = 0.125$. The two minus signs cancel. The sum is $0.125 + 0.125 = 0.25$.

Both sides give $0.25$. Sampling from the wrong policy is fine as long as we multiply by $r$.

---

## 2. The Foundation RL Starts From

RL can only reinforce behavior the model sometimes produces. MiMo-V2.6 spends its pre-RL budget making that exploration space large and making long rollouts cheap.

**Backbone.** MiMo-V2.6 is a sparse MoE Transformer. It stacks $M$ **hybrid blocks**, each made of $N$ **Sliding Window Attention (SWA)** blocks followed by one **Global Attention (GA)** block. In SWA, a token attends only to the previous $W = 128$ tokens. In GA, it attends to the whole prefix. The very first block uses GA with a dense feed-forward network to stabilize early representations. Every other block uses a sparse MoE FFN without shared experts. The two models are configured as follows:

| | MiMo-V2.6-Flash | MiMo-V2.6-Pro |
|---|---|---|
| Layers (total / SWA / GA) | 48 / 39 / 9 | 70 / 60 / 10 |
| Hidden size | 4096 | 6144 |
| SWA heads (Q / KV) | 64 / 8 | 128 / 8 |
| GA heads (Q / KV) | 64 / 4 | 128 / 8 |
| Head dims (QK / V) | 192 / 128 | 192 / 128 |
| Experts (total / active) | 256 / 8 | 384 / 8 |
| Parameters (total / active) | 310B / 15B | 1.02T / 42B |

(The report's Table 1 prints Pro's active count as "42T"; the text and abstract give 42B.)

**Why the hybrid matters for RL: a KV-cache derivation.** The **KV cache** stores each layer's keys and values for every past token, so decoding does not recompute them. For one token in one layer it holds (number of KV heads) $\times$ (key dim + value dim) numbers. For Flash:

$$
\text{GA layer: } 4 \times (192 + 128) = 1280, \qquad \text{SWA layer: } 8 \times (192 + 128) = 2560.
$$

A GA layer keeps this for all $L$ tokens. An SWA layer keeps it for at most $W = 128$ tokens, because older tokens are never attended again. At $L = 10^6$:

$$
\underbrace{9 \times 1280 \times 10^6}_{\text{GA}} + \underbrace{39 \times 2560 \times 128}_{\text{SWA}} = 1.152 \times 10^{10} + 1.28 \times 10^{7} \approx 1.153 \times 10^{10}.
$$

A hypothetical all-GA Flash with 48 layers would need $48 \times 1280 \times 10^6 = 6.144 \times 10^{10}$. The ratio is $1.153/6.144 = 0.188$, so the hybrid cache is about $5.3\times$ smaller. The SWA layers contribute only 0.1% of the total. This is what lets thousands of long agent rollouts fit in GPU memory (HBM) at once. The same window bound makes **context parallelism** cheap: an SWA layer only needs to exchange the 128 keys its queries can reach, whatever the sequence length.

**Encoders and drafter.** A 681M-parameter **MiMo-ViT** uses sink-augmented SWA. It alternates row-major and column-major token order so information spreads along both image axes, and inserts a GA layer periodically. It was pre-trained on over 4T image tokens by pairing it with a small trainable LLM under a plain cross-entropy loss. Audio goes through a tokenizer that produces 25 frames per second, each frame being 20 discrete **residual vector quantizer (RVQ)** codes. A patch encoder then sums the 20 code embeddings per frame and merges every 4 frames into one backbone position, so $25/4 = 6.25$ positions per second. A 5-layer SWA **DFlash** block-diffusion drafter predicts 7 tokens per forward pass for speculative decoding.

**Pre-training and mid-training.** Flash sees 48T tokens (26T text-only, then 22T omni-modal). Pro sees 30T (27T + 3T). Context grows from 32K to 256K. An agent-centric **mid-training** phase then trains on realistic agent trajectories in coding, general, visual, and research tasks, first at 256K and finally at 1M context. Three choices in this phase are aimed directly at RL:

1. **Optimizer switch.** AdamW adapts each parameter separately. **Muon** instead orthogonalizes the update of each weight matrix and stays data-efficient beyond the batch size where AdamW's gains flatten out. MiMo switches the hidden matrices to **Muown**, a Muon variant with explicit row-norm control. Embeddings, the LM head, and the router stay on AdamW. Prior work warned that moving an Adam-trained model to Muon causes mismatch. MiMo reports no loss spike.
2. **MXFP4 quantization-aware training**, so the experts can later be served in 4-bit during rollout.
3. **Anti-hacking data**: early trajectories that reward-hacked are rewritten so the model notices the faulty reasoning, fixes that turn, and continues honestly. We return to this in Section 6.

---

## 3. The RL Objective, Term by Term

MiMo-V2.6 trains with **Group Relative Policy Optimization (GRPO)**. For each prompt $q$ drawn from the union of task datasets $\bigcup_d \mathcal{D}_d$, the rollout policy $\mu_{\theta_{\text{old}}}$ samples a group $\{o_i\}_{i=1}^G$. The loss is

$$
\mathcal{L}(\theta) = -\mathbb{E}_{q,\ \{o_i\}}\left[\frac{1}{\sum_{i=1}^G |o_i|}\sum_{i=1}^{G}\sum_{t=1}^{|o_i|} r_{i,t}\, M_{i,t}\, A_i \log \pi_\theta(o_{i,t}\mid q, o_{i,<t})\right].
$$

Each symbol is something we have already met or can pin down on our group.

**The token-level ratio $r_{i,t}$.** Section 1 used a ratio over whole outcomes. MiMo computes it per token, with a **stop-gradient** $\text{sg}[\cdot]$:

$$
r_{i,t} = \text{sg}\!\left[\frac{\pi_\theta(o_{i,t})}{\mu_{\theta_\text{old}}(o_{i,t})}\right].
$$

The stop-gradient treats $r$ as a constant during backpropagation. The gradient of one term is then

$$
\nabla_\theta\big(r_{i,t} A_i \log\pi_\theta(o_{i,t})\big) = r_{i,t}\, A_i\, \nabla_\theta \log \pi_\theta(o_{i,t}),
$$

which is exactly the importance-sampled term from Section 1, applied token by token. The numerator comes from the training engine. The denominator is the probability the inference engine reported when the token was generated. For partial rollouts (Section 5) it is not recomputed.

**The mask $M_{i,t}$.** PPO clips the ratio. MiMo instead drops tokens whose ratio is out of range, using four separate bounds:

$$
M = \mathbb{1}\Big[(A \ge 0 \,\wedge\, \epsilon^l_+ \le r \le \epsilon^h_+) \,\vee\, (A < 0 \,\wedge\, \epsilon^l_- \le r \le \epsilon^h_-)\Big].
$$

Both intervals start at $[0.2,\ 5.0]$. Suppose a token in $o_1$ (which will have $A_1 > 0$) had $\pi_\theta = 0.3$ and $\mu = 0.25$. Then $r = 1.2 \in [0.2, 5.0]$ and $M = 1$: the token trains. Had the policy drifted to $\pi_\theta = 0.9$ against $\mu = 0.15$, then $r = 6 > 5$ and $M = 0$: the token contributes nothing. The bounds are then tuned while training runs, based on **policy entropy**. If entropy is too low, the positive interval widens and the negative one narrows, which lets more positive updates through. If entropy is too high, the opposite happens.

**The normalizer: prompt-mean aggregation.** The $1/\sum_i |o_i|$ averages over the tokens of one group. The outer expectation then averages over prompts. Each prompt gets equal total weight whatever its length. Compare **token-mean aggregation**, which divides every token by the total token count $T$ of the whole batch. There a prompt's share of the gradient is $\sum_i |o_i| / T$, which grows as its rollouts get longer. For our group, $\sum_i |o_i| = 10 + 20 + 12 + 16 = 58$. Under prompt-mean, each of its 58 tokens is weighted $1/58$ and the prompt's share is fixed. Under token-mean, doubling every rollout would double this prompt's share of the update. The report adopts prompt-mean because it "prevents response length from growing too quickly."

That leaves $A_i$, the only place where the reward enters. Everything in Sections 4–10 is about computing it.

---

## 4. Group-Relative Advantages and Dynamic Sampling

The **advantage** tells the update how much better a rollout did than the others. GRPO needs no value network: it uses the other members of the same group as the baseline. MiMo takes the plain difference from the group mean, without dividing by the standard deviation:

$$
\boxed{A_i = R_i - \bar{R}, \qquad \bar{R} = \frac{1}{G}\sum_{j=1}^G R_j.}
$$

**Advantages sum to zero.** Summing over the group,

$$
\sum_{i=1}^G A_i = \sum_{i=1}^G R_i - G\bar{R} = \sum_{i=1}^G R_i - G \cdot \frac{1}{G}\sum_{j=1}^G R_j = 0.
$$

The $G$ in front cancels the $1/G$ inside the mean. We will rely on this property repeatedly.

**Numerical check with raw test rewards.** $R^{\text{test}} = (1,1,1,0)$, so $\bar R = 3/4 = 0.75$ and

$$
A = (0.25,\ 0.25,\ 0.25,\ -0.75), \qquad 0.25 \times 3 - 0.75 = 0. \checkmark
$$

This is already a problem. The cheater $o_3$ gets the same $+0.25$ as the clean $o_1$, so every update makes copying upstream fixes more likely. Sections 6–8 fix this.

**Why all-pass and all-fail groups are discarded.** Suppose the prompt were easy and all four rollouts passed: $R = (1,1,1,1)$. Then $\bar R = 1$ and every $A_i = 1 - 1 = 0$. Every term in the loss has the factor $A_i$, so the group contributes exactly zero gradient. The same happens with $R = (0,0,0,0)$. Such groups still cost rollout compute and take batch slots while teaching nothing. MiMo's **dynamic sampler** (from DAPO) filters them out and keeps sampling until the batch is filled with **mixed-outcome groups**. This filter comes back in Section 14: it makes each data source's acceptance rate $r_i$ unpredictable, which the Sample Mixer has to handle.

---

## 5. Scaling Training Compute

The report scales RL along three axes: training compute, environments, and grader compute. First, the raw numbers for training compute.

**Batch arithmetic.** Each step samples 1,568 prompts with $G = 16$:

$$
1568 \times 16 = 25{,}088 \text{ trajectories per step.}
$$

At 2.7B–3.7B training tokens per step, the mean trajectory is

$$
\frac{2.7\times 10^9}{25{,}088} \approx 107.6\text{K} \quad\text{to}\quad \frac{3.7\times 10^9}{25{,}088} \approx 147.5\text{K tokens,}
$$

which matches the report's "roughly 110K–150K tokens per sequence."

**Where the money goes.** RL post-training cost \$2.6M for Pro and \$0.9M for Flash. For Pro, rollout takes 43.8%, training 43.5%, and the grader 12.7%. For Flash the shares are 44.9%, 40.9%, and 14.2%. Over the run, DeepSWE v1.1 average@3 rises from 58.4 to 72.6 (Pro) and from 48.7 to 65.7 (Flash). Pro finished 30 steps in 123.1 hours of wall-clock time and Flash in 81.8.

**Why a large batch.** Rollouts parallelize over sequences, and training shards the batch across data-parallel ranks, so throughput grows with GPU count. With HBM full of running sequences, decode batches are large and each weight read is used for many tokens. This ratio of compute to memory traffic is called high **arithmetic intensity**, and it keeps GPUs busy.

**Partial rollout and staleness.** Agent rollouts have a long tail: a few take far longer than the rest. Waiting for the slowest would idle the cluster. With **partial rollout**, once enough groups are collected the step proceeds, and in-flight rollouts pause and resume after the update. The resumed rollout then mixes tokens from several policy versions. This is why $\mu$ in Section 3 differs from $\pi_\theta$, and why the importance ratio is essential. MiMo allows a **staleness** of 4, meaning a token may come from a policy up to 4 updates old. There is a cost: after each update, a resumed rollout must rebuild its KV cache under the new weights (**re-prefill**). A large batch spreads that cost over more useful work, so batch size and partial rollout are tuned together.

---

## 6. Environments and the Multi-Layer Defense Against Reward Hacking

RL tasks span agentic and competitive coding (68%), aesthetic design (13%), general tool use (12%), cybersecurity (4%), and context following (3%). Each domain has its own verifier:

- **Code.** Tasks come from GitHub pull requests and issues, internal "vibe coding" requests, specification-driven tasks, CodeMidas synthesis from existing codebases, long-horizon tasks, and filtered public and vendor data. Supervision is checked two ways. For **accuracy**, a coding agent attempts each task 4 times and an auditing agent compares its own judgment of each patch with the observed reward, flagging false positives and false negatives. For **robustness**, **fail-to-pass (F2P)** tests must fail before the reference patch and pass after it, **pass-to-pass (P2P)** tests must pass both times, and both must hold across 8 reruns.
- **General.** Planning agents build resettable sandboxes from real files and locally mocked software. Tasks are graded by atomic binary rubric items: code checks for deterministic facts, LLM checks for open-ended content. Negative checks catch edits to unrelated files, and adversarial fake solutions test the rubrics. A self-hosted MiMo-V2.6-SFT model is the grader.
- **Visual.** Open-ended design uses pointwise rubrics plus groupwise comparison of rendered artifacts. Visual replication uses pixel-level similarity plus LLM judging.
- **Cyber.** The agent must produce an input that triggers a specific OSS-Fuzz vulnerability. A proof of concept is accepted exactly when its sanitizer report matches the ground truth on two strings: the vulnerability type (e.g., `heap-buffer-overflow`) and the topmost project-level stack frame. The check is deterministic and essentially free. The agent gets the compiled harness binary as well as the source.

**Reward hacking** is earning reward without solving the task. In repository repair, the dominant form is **solution leakage**: the agent finds the published fix. The report quotes five real patterns: `pip install` a newer release and read its source, `curl` the upstream file, `git clone` the upstream repository, read the issue tracker's changeset, and `pip index versions` to probe for newer releases. Our $o_3$ is the second pattern.

MiMo defends in four layers:

1. **Mid-training alignment data** (Section 2) makes the model less inclined to hack in the first place.
2. **Environment preparation** removes build logs, verifier outputs, leftover patches, binaries, and caches, truncates Git history at the base commit, and isolates the container from the network.
3. **A hack agent** attacks each prepared environment, guided by known exploits. Whatever new leak it finds is patched, and the process repeats until it finds nothing in any environment.
4. **Training-time auditing and hack zeroing.** Offline audits keep watching trajectories. Online, the groupwise grader (Section 8) sets a confirmed hack's reward to zero *before* the group mean is computed.

**What hack zeroing does to our group.** The grader confirms $o_3$ fetched the upstream file, so $R_3 \leftarrow 0$:

$$
R = (1,\ 1,\ 0,\ 0), \qquad \bar R = \tfrac{2}{4} = 0.5, \qquad A = (0.5,\ 0.5,\ -0.5,\ -0.5).
$$

The order matters. Had we zeroed $o_3$'s advantage *after* computing the mean, the mean would still be $0.75$. Rollout $o_4$ would keep $-0.75$ and the group would sum to $0.25 + 0.25 + 0 - 0.75 = -0.25 \neq 0$. Zeroing the reward first makes $o_3$ an ordinary failure: it is pushed down with $-0.5$, and the group still sums to zero. With this correction, the logged share of confirmed hacks stays below 2% for the whole run for both models.

---

## 7. Groupwise Reward Synthesis (GRS): Grading Quality Offline

After hack zeroing, $o_1$ and $o_2$ still have equal advantages, $0.5$ each. The binary test cannot see that $o_2$ swallows every `KeyError`. MiMo adds **grader compute** to separate them, and does it in two ways, each used on a different subset of code tasks.

**Groupwise Reward Synthesis** is used on a subset of tasks with high pass rates. Offline, an agent studies several rollouts of the task, together with the specification and repository, and writes two task-specific rubrics:

- **Solution rubrics** judge the implementation: requirements met, edge cases handled, consistent with the codebase.
- **Behavior rubrics** judge the process: did the agent gather evidence and check the effect of its changes?

During training, a grader agent enters each rollout's environment and scores it against these rubrics, producing $S^{\text{sol}}_i$ and $S^{\text{beh}}_i$. The reward is a product:

$$
\boxed{R_i = R^{\text{test}}_i \cdot S^{\text{sol}}_i \cdot S^{\text{beh}}_i.}
$$

**Why a product.** If $R^{\text{test}}_i = 0$, then $R_i = 0$ whatever the rubric scores are. A failing patch can never earn reward by looking tidy. Among passing patches, the rubric scores rank quality.

**Numerical check.** Say the grader scores $o_1$ as $S^{\text{sol}} = 1.0$ and $S^{\text{beh}} = 0.9$ (clean fix, ran the tests). It scores $o_2$ as $S^{\text{sol}} = 0.6$ and $S^{\text{beh}} = 0.5$ (blanket `except`, no investigation). With $o_3$ zeroed as a hack and $o_4$ failing:

$$
R = (1 \cdot 1.0 \cdot 0.9,\ \ 1 \cdot 0.6 \cdot 0.5,\ \ 0,\ \ 0) = (0.9,\ 0.3,\ 0,\ 0).
$$

$$
\bar R = \frac{0.9 + 0.3}{4} = 0.3, \qquad A = (0.6,\ 0,\ -0.3,\ -0.3).
$$

Check: $0.6 + 0 - 0.3 - 0.3 = 0$. The sloppy $o_2$ now lands exactly on the group mean and gets zero advantage. It is neither reinforced nor punished. The clean $o_1$ takes all the positive credit.

**GRS rescues all-pass groups.** Take only the two passing rollouts as their own group. Under binary rewards this is an all-pass group, and Section 4 showed it gives zero gradient and would be discarded. Under GRS the rewards are $(0.9, 0.3)$, the mean is $0.6$, and the advantages are $(+0.3, -0.3)$. A group that used to teach nothing now carries a signal. This is why GRS targets high-pass-rate tasks: most of their groups would otherwise be filtered out.

---

## 8. Groupwise Advantage Redistribution (GAR): Grading Quality Online

All remaining code tasks use **Groupwise Advantage Redistribution**. For each mixed-outcome group, an SFT-trained agentic grader sees every trajectory at once in a shared workspace: the task, the repository, all patches, and all test outputs. It can read code and run targeted tests. It contrasts passing with failing attempts and ranks the passing patches on five dimensions: suitability of the approach, precision (no omissions, no unnecessary fallbacks), minimality, avoiding unintended effects, and craftsmanship consistent with the codebase. It also confirms hacks, which is where our $R_3 \leftarrow 0$ came from.

GAR keeps the binary reward and rewrites the *advantages*. Let $\mathcal{P} = \{i : R_i = 1\}$ be the passing set after hack correction and $A_i = R_i - \bar R$. The grader assigns each passing rollout a **quality factor** $f_i \in (0, 1]$, with $f_i = 1$ for the best. Then:

$$
\lambda = \frac{\sum_{j\in\mathcal{P}} A_j}{\sum_{j\in\mathcal{P}} f_j A_j}, \qquad
A'_i = \begin{cases} \lambda f_i A_i, & i\in\mathcal{P},\\ A_i, & i\notin\mathcal{P}. \end{cases}
$$

### Deriving the conservation property

We claim the redistribution leaves the total positive mass unchanged. Sum $A'_i$ over the passing set, pulling out the common $\lambda$:

$$
\sum_{i\in\mathcal{P}} A'_i = \lambda \sum_{i\in\mathcal{P}} f_i A_i = \frac{\sum_{j\in\mathcal{P}} A_j}{\sum_{j\in\mathcal{P}} f_j A_j} \cdot \sum_{i\in\mathcal{P}} f_i A_i = \sum_{j\in\mathcal{P}} A_j.
$$

The factor $\sum f_j A_j$ in the denominator of $\lambda$ cancels the identical sum it multiplies. Failed rollouts are untouched, so the total over the whole group is also unchanged. It was zero before (Section 4), so it is still zero. The ratio of two passing advantages is $A'_i / A'_k = f_i A_i / (f_k A_k)$, so the relative weights set by the grader survive the rescaling.

**Numerical check.** The grader ranks $o_1$ above $o_2$: $f_1 = 1$, $f_2 = 0.5$. From Section 6, $A = (0.5, 0.5, -0.5, -0.5)$ and $\mathcal P = \{1, 2\}$.

$$
\lambda = \frac{0.5 + 0.5}{1 \times 0.5 + 0.5 \times 0.5} = \frac{1}{0.75} = \frac{4}{3}.
$$

$$
A'_1 = \tfrac{4}{3} \times 1 \times 0.5 = \tfrac{2}{3} \approx 0.667, \qquad A'_2 = \tfrac{4}{3} \times 0.5 \times 0.5 = \tfrac{1}{3} \approx 0.333.
$$

Positive mass: $\tfrac{2}{3} + \tfrac{1}{3} = 1 = 0.5 + 0.5$. $\checkmark$ Whole group: $\tfrac{2}{3} + \tfrac{1}{3} - 0.5 - 0.5 = 0$. $\checkmark$ The clean patch now gets twice the credit of the sloppy one, and the failures are exactly as before.

<div style="display:flex;justify-content:center;margin:1.5rem 0;">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 250" font-family="system-ui,-apple-system,sans-serif" font-size="11"><style>.l{fill:currentColor;text-anchor:middle;dominant-baseline:central;font-weight:500}.s{fill:currentColor;opacity:.6;text-anchor:middle;dominant-baseline:central;font-size:10}.z{stroke:currentColor;stroke-width:1;opacity:.5}.p{fill:currentColor;fill-opacity:.55}.n{fill:currentColor;fill-opacity:.18;stroke:currentColor;stroke-opacity:.4}</style><text x="130" y="14" class="l">Before GAR (after hack zeroing)</text><text x="390" y="14" class="l">After GAR (f₁ = 1, f₂ = 0.5, λ = 4/3)</text><line x1="30" y1="125" x2="230" y2="125" class="z"/><line x1="290" y1="125" x2="490" y2="125" class="z"/><rect x="45" y="75" width="30" height="50" class="p"/><text x="60" y="65" class="s">+0.50</text><rect x="95" y="75" width="30" height="50" class="p"/><text x="110" y="65" class="s">+0.50</text><rect x="145" y="125" width="30" height="50" class="n"/><text x="160" y="185" class="s">−0.50</text><rect x="195" y="125" width="30" height="50" class="n"/><text x="210" y="185" class="s">−0.50</text><rect x="305" y="58.3" width="30" height="66.7" class="p"/><text x="320" y="48" class="s">+0.667</text><rect x="355" y="91.7" width="30" height="33.3" class="p"/><text x="370" y="81" class="s">+0.333</text><rect x="405" y="125" width="30" height="50" class="n"/><text x="420" y="185" class="s">−0.50</text><rect x="455" y="125" width="30" height="50" class="n"/><text x="470" y="185" class="s">−0.50</text><text x="60" y="205" class="l">o₁</text><text x="110" y="205" class="l">o₂</text><text x="160" y="205" class="l">o₃</text><text x="210" y="205" class="l">o₄</text><text x="320" y="205" class="l">o₁</text><text x="370" y="205" class="l">o₂</text><text x="420" y="205" class="l">o₃</text><text x="470" y="205" class="l">o₄</text><text x="130" y="232" class="s">positive mass 1.0 · negative mass 1.0</text><text x="390" y="232" class="s">positive mass 1.0 · negative mass 1.0</text></svg>
</div>

### Why not just downweight?

This is the step most readers skip, and the whole design depends on it. The obvious alternative is to multiply passing advantages by $f_i$ and stop. That gives $(0.5,\ 0.25,\ -0.5,\ -0.5)$. The positive mass is now $0.75$ while the negative mass is still $1.0$, so the group sums to $-0.25$. The update is net negative.

Why does net negative pressure matter? A negative advantage lowers the probability of the tokens that were sampled. That probability has to go somewhere, and it spreads over all the tokens that were *not* sampled, which flattens the distribution. A flatter distribution has higher entropy. Positive advantages do the opposite: they concentrate probability on sampled tokens. When negative mass exceeds positive mass step after step, entropy keeps rising. The report names "excess negative optimization pressure" as a driver of "uncontrolled entropy growth". The factor $\lambda$ restores the balance, and Section 10's segment penalties are built on the same principle.

### The cap and the final re-centering

When the $f_i$ are very uneven, $\lambda$ can get large and blow up one rollout's advantage. MiMo therefore caps $\lambda$ (the report does not publish the cap). A capped $\lambda$ no longer conserves mass, so MiMo re-centers the group afterwards: subtract the group mean from every advantage, passing and failing alike.

**Numerical check with a cap.** Take an illustrative cap $\lambda_{\max} = 1.2$ in place of $4/3$:

$$
A'_1 = 1.2 \times 0.5 = 0.6, \qquad A'_2 = 1.2 \times 0.25 = 0.3, \qquad A' = (0.6,\ 0.3,\ -0.5,\ -0.5).
$$

The sum is $0.9 - 1.0 = -0.1$, so the mean is $-0.025$. Subtracting it:

$$
A^{\text{new}} = (0.625,\ 0.325,\ -0.475,\ -0.475), \qquad 0.625 + 0.325 - 0.475 - 0.475 = 0. \checkmark
$$

In the uncapped case the mean is already zero and re-centering changes nothing. The sequence-level $A^{\text{new}}_i$ is copied to every model-generated token of rollout $i$. Grading runs asynchronously, and if the grader's output is unusable, the original advantages are used.

**Evidence.** In code-only RL on Flash (batch 128, token-mean aggregation), runs without GAR saw turns and token counts balloon. More rollouts hit the length limit, and the pass rate stopped improving. With GAR, the pass rate kept rising through step 52 while turn counts stayed roughly flat. Maintainers auditing the no-GAR policy found exactly $o_2$-style habits: speculative compatibility branches, broad exports, swallowed exceptions, relaxed validation, and evaluation-specific config changes. The GAR policy wrote smaller patches that stayed within scope.

---

## 9. The Group-Relative Length Penalty

Longer rollouts cost more and, the report finds, generalize worse. MiMo subtracts a length penalty from *successful* rollouts that run long *relative to other successes on the same prompt*. For prompt $q$, let $\mathcal{P}_q$ be the successful rollouts. If the group pass rate exceeds a threshold, $|\mathcal P_q|/G > A$ (a hyperparameter, not the advantage), compute a reference length from a percentile of the successful lengths:

$$
\ell^\star_q = \text{Quantile}_{B/100}\{\ell_j : j\in\mathcal P_q\},
$$

and adjust the reward:

$$
\tilde R_i = R_i - \mathbb 1[i\in\mathcal P_q]\; X \left[\text{clip}\!\left(\frac{\ell_i/\ell^\star_q - 1 - \delta}{s - \delta},\ 0,\ 1\right)\right]^{\gamma}.
$$

Here $X \ge 0$ is the maximum deduction and $\delta$ the tolerated excess. The penalty saturates once the relative excess $\ell_i/\ell^\star_q - 1$ reaches $s$. The exponent $\gamma \ge 1$ shapes the ramp, and $\text{clip}(x, 0, 1) = \min(1, \max(0, x))$.

**Reading the formula piece by piece.**
- $\ell_i/\ell^\star_q - 1$ is the **relative excess**. It is $0.25$ for a rollout 25% longer than the reference.
- Subtracting $\delta$ and dividing by $s - \delta$ maps the excess range $[\delta, s]$ onto $[0, 1]$: no penalty up to $\delta$, full penalty from $s$ on.
- The indicator restricts the penalty to successes. A failure is already at $R = 0$, and making it shorter or longer says nothing about quality.
- The pass-rate gate skips hard prompts, where the model still needs room to explore with long attempts.

**Numerical check.** The report does not publish $A, B, X, \delta, s, \gamma$, so we pick illustrative values: $A = 0.25$, $B = 50$ (median), $X = 0.2$, $\delta = 0.1$, $s = 0.5$, $\gamma = 2$. After hack zeroing, $R = (1, 1, 0, 0)$ and $\mathcal P_q = \{1, 2\}$. The pass rate $2/4 = 0.5 > 0.25$, so the gate is open. The median of $\{10, 20\}$ under linear interpolation is $\ell^\star_q = 15$.

For $o_1$: $10/15 - 1 = -1/3$. Then $(-1/3 - 0.1)/0.4 = -1.083$, which clips to $0$. No penalty, and $\tilde R_1 = 1$.

For $o_2$: $20/15 - 1 = 1/3$. Then

$$
\frac{\tfrac13 - \tfrac1{10}}{\tfrac25} = \frac{\tfrac{7}{30}}{\tfrac25} = \frac{7}{30}\cdot\frac{5}{2} = \frac{7}{12} \approx 0.583,
$$

which lies inside $[0,1]$. The deduction is $0.2 \times (7/12)^2 = 0.2 \times 49/144 = 49/720 \approx 0.068$, so $\tilde R_2 = 1 - 0.068 = 0.932$.

The adjusted rewards are $\tilde R = (1,\ 0.932,\ 0,\ 0)$. The mean is $1.932/4 = 0.483$, and the advantages are

$$
A = (0.517,\ 0.449,\ -0.483,\ -0.483), \qquad 0.517 + 0.449 - 0.483 - 0.483 = 0. \checkmark
$$

The penalty is a reward-side edit, so centering on the group mean still gives a zero-sum group. The padded $o_2$ loses about 10% of its positive credit to $o_1$.

---

## 10. Segment-Level Behavioral Penalties

Outcome rewards credit every token in a rollout equally. Suppose a passing rollout contains a malformed tool call that happened to be harmless. The outcome reward reinforces the malformed call along with everything else. MiMo flags individual tokens: $h_{i,t} = 1$ marks tokens in a **format violation** or **tool-call error** (malformed markup, invalid tool names, malformed arguments), and $0$ otherwise. Across the whole training batch, let $H^{\pm}$ be the flagged tokens and $C^{\pm}$ the clean tokens (with loss mask $1$), split by the sign of the owning rollout's advantage. The token advantage becomes

$$
\tilde A_{i,t} = \begin{cases}
\alpha\,(1-h_{i,t})\,A_i, & A_i > 0,\\
\big(\beta\,(1-h_{i,t}) + \kappa\, h_{i,t}\big)\,A_i, & A_i < 0,\\
0, & A_i = 0,
\end{cases}
$$

$$
\alpha = \min\!\left(\alpha_{\max},\ 1 + \frac{\sum_{H^+} A_i}{\sum_{C^+} A_i}\right), \qquad
\beta = \max\!\left(\beta_{\min},\ 1 - (\kappa-1)\frac{\sum_{H^-} |A_i|}{\sum_{C^-} |A_i|}\right), \qquad \kappa > 1.
$$

Each sum runs over tokens, so a rollout with 18 clean tokens contributes its $A_i$ eighteen times.

**What each case does.**
- *Positive rollout.* Flagged tokens get $1 - h = 0$, so they are masked: a success never reinforces its mistakes. Clean tokens are scaled up by $\alpha \ge 1$.
- *Negative rollout.* Flagged tokens get $\kappa A_i$, a stronger push down. Clean tokens get $\beta A_i$ with $\beta \le 1$, a weaker one.

### Deriving conservation for each sign

**Positive side.** Before the penalty, the positive mass is $\sum_{H^+} A_i + \sum_{C^+} A_i$. After it, the flagged tokens give zero and the clean tokens give $\alpha \sum_{C^+} A_i$. Without clipping, $\alpha = 1 + \sum_{H^+} A_i / \sum_{C^+} A_i$, so

$$
\alpha\sum_{C^+} A_i = \sum_{C^+} A_i + \frac{\sum_{H^+} A_i}{\sum_{C^+} A_i}\sum_{C^+} A_i = \sum_{C^+} A_i + \sum_{H^+} A_i.
$$

The $\sum_{C^+} A_i$ cancels in the second term. The mass taken from flagged tokens moves to clean ones.

**Negative side.** For $A_i < 0$ write $A_i = -|A_i|$. Before the penalty, the negative mass is $-\sum_{H^-} |A_i| - \sum_{C^-}|A_i|$. After it:

$$
\kappa\sum_{H^-}A_i + \beta\sum_{C^-}A_i = -\kappa\sum_{H^-}|A_i| - \left(1 - (\kappa-1)\frac{\sum_{H^-}|A_i|}{\sum_{C^-}|A_i|}\right)\sum_{C^-}|A_i|.
$$

Distribute the second bracket. The $\sum_{C^-}|A_i|$ cancels against the denominator:

$$
= -\kappa\sum_{H^-}|A_i| - \sum_{C^-}|A_i| + (\kappa-1)\sum_{H^-}|A_i| = -\sum_{H^-}|A_i| - \sum_{C^-}|A_i|.
$$

Because $-\kappa + (\kappa - 1) = -1$, this is exactly the original negative mass. $\blacksquare$

When $\alpha$ or $\beta$ is clipped, or a denominator is zero (in which case the scale is set to $1$), conservation no longer holds exactly, and the report says so.

**Numerical check.** Use the hack-corrected advantages $A = (0.5, 0.5, -0.5, -0.5)$ and treat our group as the whole batch. Say $o_2$ has 2 flagged tokens (a malformed tool call) and $o_4$ has 4 (an invalid tool name). Take $\kappa = 2$, $\alpha_{\max} = 1.5$, and $\beta_{\min} = 0.5$ (illustrative).

*Positive side.* $H^+$: 2 tokens of $o_2$, so $\sum_{H^+} A = 2 \times 0.5 = 1$. $C^+$: 10 tokens of $o_1$ plus 18 of $o_2$, so 28 tokens and $\sum_{C^+} A = 28 \times 0.5 = 14$. Then $\alpha = \min(1.5,\ 1 + 1/14) = 15/14 \approx 1.071$. Mass before: $30 \times 0.5 = 15$. Mass after: $28 \times \tfrac{15}{14} \times 0.5 = 15$. $\checkmark$

*Negative side.* $H^-$: 4 tokens of $o_4$, so $\sum_{H^-}|A| = 4 \times 0.5 = 2$. $C^-$: 12 tokens of $o_3$ plus 12 clean tokens of $o_4$, so $\sum_{C^-}|A| = 24 \times 0.5 = 12$. Then $\beta = \max(0.5,\ 1 - 1 \times 2/12) = 5/6$. Flagged tokens get $2 \times (-0.5) = -1$ each, for $4 \times (-1) = -4$. Clean tokens get $\tfrac56 \times (-0.5) = -\tfrac{5}{12}$ each, for $24 \times (-\tfrac{5}{12}) = -10$. Total $-14$, equal to the original $28 \times (-0.5) = -14$. $\checkmark$

The invalid tool call in $o_4$ is pushed down twice as hard as before, and the malformed call in $o_2$ is no longer reinforced. The totals on each side are unchanged, so the update is no more negative than before.

**Where this lives in the system.** These penalties run inside a **Penalty Module**, which separates *detection* from *effect*. A **Rule** judges a segment, context, or sequence (by hand-written logic or a model judge). It can flag infrastructure failures, garbled tokens, calls to unavailable tools, or repetition. A **Strategy** decides what to do: mask, shape advantages, or just log. Penalties escalate. A context with no surviving model turns is dropped, a sequence with no surviving context gets zero advantage, and a prompt with no surviving sequence is rejected. An **early stop** strategy halts a rollout the moment its rule fires and zeroes the outcome reward. Infrastructure failures are masked instead of punished, so the model is never blamed for a crashed container.

---

## 11. One Framework: Every Mechanism Edits the Advantage Vector

Sections 4–10 introduced six mechanisms. They are all edits to one vector, the group's advantages. Each is either a **reward-side edit**, which changes $R_i$ before centering, or an **advantage-side edit**, which changes $A_i$ after it:

| Mechanism | Side | Edit | Keeps positive/negative balance by |
|---|---|---|---|
| Group-relative baseline | — | $A_i = R_i - \bar R$ | construction: $\sum A_i = 0$ |
| Hack zeroing | reward | $R_i \leftarrow 0$ | centering after the edit |
| GRS | reward | $R_i = R^{\text{test}}_i S^{\text{sol}}_i S^{\text{beh}}_i$ | centering after the edit |
| Length penalty | reward | $R_i \leftarrow R_i - \text{penalty}_i$ | centering after the edit |
| GAR | advantage | $A_i \leftarrow \lambda f_i A_i$ on $\mathcal P$ | the common factor $\lambda$, then re-centering |
| Segment penalties | advantage (per token) | $\alpha, \beta, \kappa$ scaling | $\alpha$ and $\beta$ conserve each sign's mass |

Every row keeps the total advantage mass in balance, and none makes the update net negative. Reward-side edits get this for free from mean-centering. Advantage-side edits have to build it in. That is why GAR has $\lambda$ and the segment penalty has $\alpha$ and $\beta$. MiMo's recipe is one rule applied six times: *change where the credit goes, never how much credit there is.*

<div style="display:flex;justify-content:center;margin:1.5rem 0;">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 150" font-family="system-ui,-apple-system,sans-serif" font-size="11"><style>.b{fill:none;stroke:currentColor;stroke-width:1.5;rx:6;opacity:.7}.bh{fill:currentColor;fill-opacity:.08;stroke:currentColor;stroke-width:1.5;rx:6}.l{fill:currentColor;text-anchor:middle;dominant-baseline:central;font-weight:500}.s{fill:currentColor;opacity:.6;text-anchor:middle;dominant-baseline:central;font-size:10}.c{stroke:currentColor;stroke-width:1.5;opacity:.35}.a{fill:currentColor;opacity:.35}</style><rect x="10" y="30" width="110" height="46" class="bh"/><text x="65" y="46" class="l">Rollout</text><text x="65" y="62" class="s">G trajectories</text><line x1="120" y1="53" x2="146" y2="53" class="c"/><polygon points="142,48 150,53 142,58" class="a"/><rect x="150" y="30" width="140" height="46" class="b"/><text x="220" y="46" class="l">Reward-side edits</text><text x="220" y="62" class="s">hack → 0 · GRS · length</text><line x1="290" y1="53" x2="316" y2="53" class="c"/><polygon points="312,48 320,53 312,58" class="a"/><rect x="320" y="30" width="90" height="46" class="bh"/><text x="365" y="46" class="l">A = R − R̄</text><text x="365" y="62" class="s">sum = 0</text><line x1="410" y1="53" x2="436" y2="53" class="c"/><polygon points="432,48 440,53 432,58" class="a"/><rect x="440" y="30" width="140" height="46" class="b"/><text x="510" y="46" class="l">Advantage-side edits</text><text x="510" y="62" class="s">GAR (λ) · segment (α, β, κ)</text><line x1="580" y1="53" x2="606" y2="53" class="c"/><polygon points="602,48 610,53 602,58" class="a"/><text x="622" y="53" class="l">Eq. 1</text><text x="320" y="112" class="s">every edit moves credit between rollouts or tokens; none changes the balance of positive and negative mass</text></svg>
</div>

---

## 12. Training–Inference Consistency: Same Weights, Different Probabilities

The ratio $r_{i,t}$ is only meaningful if $\pi_\theta$ and $\mu$ differ because the *policy* changed, not because the two engines compute differently. MiMo runs rollout in SGLang and training in Megatron-LM, and closes three gaps between them.

### Top-$p$ candidate-set replay

This is the gap that surprises almost everyone: identical weights, identical logits, and still a ratio that is not 1.

**Top-$p$ (nucleus) sampling** keeps the smallest set of most-likely tokens whose total probability reaches $p$, renormalizes over that set, and samples. Suppose that at one step of $o_1$ both engines produce the same full-vocabulary distribution over four tokens:

$$
\pi(a) = 0.60,\quad \pi(b) = 0.25,\quad \pi(c) = 0.10,\quad \pi(d) = 0.05.
$$

With $p = 0.8$: $\{a\}$ holds $0.60 < 0.8$, and $\{a, b\}$ holds $0.85 \ge 0.8$. So the candidate set is $\{a, b\}$. The sampler draws $a$ with probability

$$
\mu(a) = \frac{0.60}{0.60 + 0.25} = \frac{0.60}{0.85} \approx 0.706.
$$

That is the probability the inference engine records. The training engine, computing a normal softmax over the full vocabulary, reports $\pi_\theta(a) = 0.60$. The ratio is

$$
r = \frac{0.60}{0.706} = 0.85 \neq 1,
$$

even though nothing has been trained yet. Every token sampled under top-$p$ carries this systematic bias. The fix is to record each token's candidate set during rollout and renormalize the training log-probability over the *same* set:

$$
\pi^{\text{renorm}}_\theta(a) = \frac{\pi_\theta(a)}{\sum_{v\in\{a,b\}}\pi_\theta(v)} = \frac{0.60}{0.85} \approx 0.706, \qquad r = \frac{0.706}{0.706} = 1. \checkmark
$$

Moving these sets around is cheap. Only the GPU-to-CPU transfer is dense: a full-vocabulary bitmap of fixed shape, which avoids a GPU–CPU synchronization. Everything after that is sparse, because at MiMo's typical $p = 0.97$ a candidate set has fewer than five tokens on average.

### Rollout Routing Replay (R3)

In an MoE layer, each token picks its top-8 experts by router score. If two experts score $0.5001$ and $0.4999$ in the inference engine, a tiny numerical difference in the training engine can swap them. The token then runs through a different expert, and $\pi_\theta$ is computed on a different network path from the one that produced $\mu$. **R3** records the expert indices chosen during rollout and forces training to use them.

### Quantize–dequantize (QDQ)

Rollout runs the experts in MXFP4 with the Humming GEMM kernels. After every parameter update, the training side quantizes and immediately dequantizes the expert weights under the same numeric constraints, so both engines see bit-identical expert weights.

All three records (candidate sets, expert indices, visual inputs) travel with the **Context Cache**. It persists each dialogue's KV cache across turns within one policy version, so a new turn only prefills its new suffix. During tool calls it offloads idle state to pinned host memory on side CUDA streams, and it returns the records only when the rollout is collected. RL-adapted block-6 DFlash speculative decoding raises the average accepted length by 31.3% over the inherited MTP-3 drafter. In FP8 it adds about 10.3% per-node throughput.

---

## 13. Router Freezing: Stopping Load Collapse

From [MoE Load Balancing from Scratch](/blog/mixture-of-experts-load-balancing-from-scratch): **expert load** is the number of tokens routed to an expert, and **expert collapse** is when a few experts take most of the load. MiMo tracks three statistics of per-step loads $n_1, \dots, n_E$ with mean $\bar n$:

- **Coefficient of variation (CV):** $\text{std}(n)/\bar n$, the spread relative to the mean.
- **Peak load factor:** $\max_e n_e / \bar n$, how overloaded the busiest expert is.
- **Cold fraction:** the share of experts with $n_e < 0.1\,\bar n$.

**Numerical check.** Route our group's $58$ tokens through a toy 4-expert layer. A healthy split $(29, 15, 12, 2)$ has $\bar n = 14.5$. The deviations are $(14.5, 0.5, -2.5, -12.5)$, their squares are $(210.25, 0.25, 6.25, 156.25)$, the squares sum to $373$, the variance is $373/4 = 93.25$, and the standard deviation is $\sqrt{93.25} = 9.66$. So

$$
\text{CV} = 9.66/14.5 = 0.67, \qquad \text{peak} = 29/14.5 = 2.0, \qquad \text{cold} = 0\% \ (\text{no load below } 1.45).
$$

A collapsed split $(50, 4, 3, 1)$ has the same mean. The deviations are $(35.5, -10.5, -11.5, -13.5)$, the squares sum to $1685$, the variance is $421.25$, and the standard deviation is $20.52$. So

$$
\text{CV} = 20.52/14.5 = 1.42, \qquad \text{peak} = 50/14.5 = 3.45, \qquad \text{cold} = 25\% \ (\text{the load of } 1 < 1.45).
$$

**What happened in MiMo-V2.6-Pro.** With a trainable router, at decoder layer 9 (384 experts), all three statistics rose steadily over the first 20 RL steps. CV went from 0.78 to 2.0, peak load from $6\times$ to $16\times$, and the cold fraction from 0.5% to 22%. To find the cause, the team took the step-20 checkpoint and reset *only* the router to its pre-RL values. Load balance returned to near its starting level, and benchmark scores did not change. So the collapse came from the router drifting, not from the experts degrading. The fix is to **freeze the router** during RL. The frozen run stays flat (CV $\approx 0.7$, peak $\approx 5.5\times$, cold $\approx 1\%$) while scores improve normally.

Even with a frozen router, a single micro-batch can be badly unbalanced. One expert-parallel rank received over $30\times$ the mean token load at one layer and ran out of GPU memory, which forced a parallelism change.

---

## 14. The Sample Mixer: Keeping the Task Mix Stable

A mixed-task batch should contain each source in a fixed proportion, say $B_i$ accepted groups per step from source $i$. Sources differ enormously. Across 25 profiled sources, mean generated tokens vary $90\times$ and rollout durations vary $66\times$. Dynamic sampling (Section 4) discards a source-dependent fraction of groups. If every source got the same number of concurrent rollouts, fast sources would fill their quota at once and slow ones would lag behind.

Extend our running example to a two-source batch: **Code** (the source of our prompt) and **Chat**. Let the targets be $B_{\text{code}} = B_{\text{chat}} = 4$ groups, the acceptance rates $r_{\text{code}} = 0.5$ and $r_{\text{chat}} = 0.8$, and the rollout durations $t_{\text{code}} = 30$ min and $t_{\text{chat}} = 1$ min.

### Step 1: demand

To keep $B_i$ groups after filtering at acceptance rate $r_i$, we must generate

$$
m_i = \frac{B_i}{r_i}: \qquad m_{\text{code}} = \frac{4}{0.5} = 8, \qquad m_{\text{chat}} = \frac{4}{0.8} = 5.
$$

### Step 2: concurrency from Little's law

**Little's law** from queueing theory says the average number of items in a system equals the arrival rate times the average time each spends inside: $L = \lambda W$. Rollouts from source $i$ must complete at a rate proportional to $m_i$ per step, and each lives for $t_i$. So the number in flight must scale as $t_i m_i$. This is the report's "required concurrency scales with $t_i m_i$": $30 \times 8 = 240$ for Code against $1 \times 5 = 5$ for Chat.

### Step 3: oversampling

Each source gets a budget of $(1 + p_i)\,m_i$ groups, with an oversampling ratio

$$
p_i = \text{clip}(c\,t_i - 1,\ p_{\min},\ p_{\max}), \qquad \frac{\sum_i m_i p_i}{\sum_i m_i} = \bar p.
$$

Slow sources get more headroom. The shared constant $c$ is solved so the demand-weighted mean oversampling equals a global $\bar p$. Take $\bar p = 0.5$, $p_{\min} = 0$, and $p_{\max} = 2$.

*First try, ignoring the clip:*

$$
\frac{8(30c - 1) + 5(c - 1)}{13} = 0.5 \ \Rightarrow\ 245c - 13 = 6.5 \ \Rightarrow\ c = 0.0796.
$$

This gives $p_{\text{chat}} = 0.0796 - 1 = -0.92$, below $p_{\min}$, so it clips to $0$. The equation used the unclipped value, so we solve again.

*Second try, with Chat clipped at 0:*

$$
\frac{8(30c - 1) + 5 \times 0}{13} = 0.5 \ \Rightarrow\ 30c - 1 = \frac{6.5}{8} = 0.8125 \ \Rightarrow\ c = 0.0604.
$$

Check: $p_{\text{code}} = 0.8125 \in [0, 2]$, and $c\,t_{\text{chat}} - 1 = -0.94$ still clips to $0$. The mean is $(8 \times 0.8125 + 5 \times 0)/13 = 6.5/13 = 0.5$. $\checkmark$ The budgets are $(1.8125)(8) = 14.5$ groups for Code and $5$ for Chat. The allocation is recomputed as timing and acceptance statistics change.

### Step 4: which source to launch next

Within these budgets, sources are chosen by **smooth weighted round-robin** with weights

$$
w_i = \alpha\frac{B_i}{r_i} + (1-\alpha)\frac{(B_i - A_i)_+}{r_i},
$$

where $A_i$ counts groups already accepted this step and $(x)_+ = \max(x, 0)$. (This $A_i$ and $\alpha$ are the report's notation for this equation only. They are not the advantage or the segment-penalty $\alpha$.) Suppose Chat has already met its quota, $A_{\text{chat}} = 4$, while Code has $A_{\text{code}} = 1$. With $\alpha = 0.5$:

$$
w_{\text{code}} = 0.5 \times 8 + 0.5 \times \frac{3}{0.5} = 4 + 3 = 7, \qquad w_{\text{chat}} = 0.5 \times 5 + 0.5 \times \frac{0}{0.8} = 2.5.
$$

Code gets $7/9.5 \approx 74\%$ of the next launches. With $\alpha = 0$ (pure deficit), Chat's weight would drop to $0$. Its pipeline would empty and have to refill from scratch next step, which makes rollout occupancy unstable. With $\alpha = 1$ (pure target), the ratio would stay at $8:5$ however far behind Code was. In the report's trace-driven simulation, $\alpha = 0.5$ was steadier than $\alpha = 0$ and more balanced than $\alpha = 1$.

Two more pieces finish the Mixer. **Predictive Rollout Dispatch** admits a rollout to a GPU rank only if a safety multiple of its predicted KV demand fits. It then places the rollout on the rank with the most remaining capacity, measured as the smaller of free concurrency slots and free KV space. **Sample Replay** reuses completed groups from slow sources in the first step after startup or recovery. Startup collection takes about $1.8\times$ longer than steady state, and short rollouts finish first, which would otherwise bias the first batch.

The rest of the infrastructure supports these mechanisms. Each rollout runs as an **Agent Loop** that owns its environment's lifecycle and calls the inference engine token-in, token-out. Trajectories form a four-level hierarchy (Sample → Sequence → Context → Segment), and only model-generated Segments carry loss. A **Harness Pool** of persistent Ray host actors, each hosting many tenants, avoids running out of file descriptors on Ray's control node. A **Payload Porter** keeps the driver working on metadata only, while heavy payloads (routing records, top-$p$ bitmaps, images) go into a distributed key-value store and are packed where they are consumed.

---

## 15. Multi-Harness Training and MOPD2

An **agent harness** is the loop around the model: system prompt, tools, and context management. Training in one harness can tie the learned strategies to that harness's quirks. Production harnesses (MiMo Code, Codex) are poor RL environments. They add instructions the reward never measures, which blurs credit assignment, and their modules are too coupled to vary one at a time. MiMo builds **mini-harnesses** instead: all start from the same minimal agent loop, and the modules are decoupled so they can be recombined into task-specific variants for Code, General, Visual, and Cyber.

On DeepSWE v1.1, training on four code mini-harnesses also raised performance on three held-out harnesses (Codex, Claude Code, mini-swe-agent). Their mean pass@1 went from about 50% to about 66%, and the gap to the training harnesses narrowed.

After mixed RL, **Multi-Prefix Multi-Teacher On-Policy Distillation (MOPD2)** merges in skills from domain teachers: mixRL teachers for verifiable tasks, and SFT teachers for open-domain tasks where no reliable reward exists. Standard MOPD has a teacher score full student rollouts token by token. MOPD2 adds **prefix-conditioned** rollouts. A source trajectory with $k$ assistant turns gives $k$ history prefixes $h_1, \dots, h_k$, each ending just before an assistant turn. The student generates only that one turn, and the teacher supervises it. If $o_1$ had 3 assistant turns, it would give 3 single-turn distillation problems. Starting from a fixed prefix keeps the student in the histories the SFT teacher actually saw, so a student that has drifted is never judged in situations the teacher never learned. This extends training to domains such as long-horizon game development, scientific research, and embodied intelligence.

---

## 16. Results

A selection from the report's final comparison (Table 3):

| Benchmark | V2.6-Pro | V2.6-Flash | V2.5-Pro | Claude Opus 5 | GPT-5.6 Sol | Claude Fable 5 |
|---|---|---|---|---|---|---|
| DeepSWE v1.1 | 71.9 | 67.9 | 19.0 | 74.0 | 73.0 | 70.0 |
| ProgramBench | 26.5 | 26.0 | 12.5 | 37.0 | 25.0 | 33.0 |
| AutomationBench v1.0.6 | 53.1 | 52.3 | 16.0 | 50.3 | 45.8 | 46.2 |
| Toolathlon-Verified | 76.9 | 73.6 | 49.1 | 80.6 | 74.9 | 77.9 |
| Terminal Bench 2.1 | 89.9 | 87.6 | 65.2 | 89.1 | 88.8 | 84.3 |
| Terminal Bench 4.0 | 34.9 | 28.8 | 1.5 | 49.0 | 39.9 | 42.4 |
| OSWorld-Verified | 82.0 | 80.8 | – | 83.4 | 83.0 | 86.0 |
| CyberGym | 94.0 | 95.1 | 40.0 | – | – | – |
| ExploitBench | 47.9 | 25.3 | 16.6 | 70.0 | 78.5 | 78.0 |
| MiMo Visual Coding | 72.3 | 71.5 | – | 70.0 | 73.4 | 69.1 |

The jump from V2.5 is large everywhere. Against frontier models, V2.6-Pro leads on AutomationBench and Terminal Bench 2.1 and is close on DeepSWE and OSWorld. It trails clearly on Terminal Bench 4.0 and on exploit development (ExploitBench, ExploitGym). That fits the training mix: the cyber RL task is vulnerability *reproduction*, not exploitation. Over training, scores rise together with total tokens used (Figure 9), so part of the gain comes with longer rollouts. The length penalty and GAR slow that growth but do not stop it.

**What went wrong during the run.** Infrastructure failures were mostly GPU double-bit memory errors, plus a Kubernetes failure (Flash) and an unreachable grader (Pro). Rollout failures came from partial rollout. Short rollouts finish first after a restart, which biased the length priors in Predictive Dispatch and exhausted the KV pools. One harness also produced rollouts less than half as long as the others on the same dataset. Training failures were the $30\times$ expert-imbalance out-of-memory errors from Section 13. Driver failures were CPU out-of-memory errors during packing, late in the Flash run, as sequences grew.

---

## 17. Open Foundations: The 9B Distilled Model

To make agentic RL research reproducible, the team released **MiMo-V2.6-Distill-Qwen-9B**, which is Qwen3.5-9B fine-tuned on 77.4B tokens of MiMo-generated data (27.2B of them loss tokens: code 7.3B, cyber 4.8B, general 5.7B, visual 9.4B). They also released about 7K RL tasks with verifiers (3K code, 1K cyber, 1K general, 2K visual, plus about 1K music-generation tasks), the RL framework, and the mini-harnesses.

Starting from the same SFT checkpoint, domain-specific GRPO improved all 11 reported evaluations:

| Benchmark | Qwen3.5-9B | SFT | +RL |
|---|---|---|---|
| SWE-bench Verified | 60.0 | 61.1 | 66.2 |
| SWE-bench Pro | 32.0 | 44.6 | 47.6 |
| MiMo Code Bench (mini) | 19.5 | 51.6 | 59.9 |
| MiMo Cyber Bench (mini) | 5.7 | 31.3 | 47.0 |
| AutomationBench v1.0.6 | 5.0 | 30.3 | 33.1 |
| Terminal Bench 2.1 | 27.0 | 37.1 | 52.8 |
| Toolathlon-Verified | 25.9 | 35.2 | 38.0 |
| OfficeQA Pro | 9.0 | 19.5 | 24.8 |
| JobBench | 2.6 | 18.3 | 25.2 |
| MiMo General Bench (mini) | 28.5 | 62.2 | 70.6 |
| MiMo Visual Coding (mini) | 61.7 | 64.0 | 72.4 |

A separate multi-harness coding run (four training mini-harnesses, three held out) improved every one of 21 dataset–harness pairs over the SFT checkpoint. On MiMo Code Bench (mini), the gains ranged from 1.8 to 9.3 points depending on the harness. The mean over the seven harnesses rose from 53.1 to 59.0. A music-composition benchmark rose from 45.7 to 52.5. The report's case study on website generation shows the same $61.7 \to 64.0 \to 72.4$ progression visually: plain layouts from Qwen3.5-9B, richer content after SFT, and polished, complete pages after RL.

---

## Summary

MiMo-V2.6 trains with importance-sampled GRPO, $\nabla J = \mathbb{E}_\mu[r A \nabla \log \pi]$. Every added mechanism edits the group's advantage vector without changing its balance. Reward-side edits (hack zeroing, the multiplicative GRS reward $R^{\text{test}} S^{\text{sol}} S^{\text{beh}}$, the group-relative length penalty) stay balanced because $A = R - \bar R$ always sums to zero. Advantage-side edits (GAR's $\lambda f_i A_i$, the segment penalty's $\alpha, \beta, \kappa$) are built to conserve mass, which moves credit from the sloppy patch to the clean one without adding net negative pressure that drives entropy up. The rest of the stack keeps the ratio $r$ and the batch honest: top-$p$ candidate replay, R3, and QDQ make $r = 1$ when the policy has not changed; router freezing stops load collapse; and the Little's-law Sample Mixer keeps the task mix stable while 25,088 long rollouts are in flight.

---

*Previous: [MaxRL: From REINFORCE to Maximum Likelihood](/blog/maxrl-from-reinforce-to-maximum-likelihood)*
