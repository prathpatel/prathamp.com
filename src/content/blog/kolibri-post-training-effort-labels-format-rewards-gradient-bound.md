---
title: "Kolibri Post-Training from Scratch: Effort Labels, Format Rewards and a Gradient-Norm Trust Region"
description: "Building Aleph Alpha's Kolibri post-training recipe from the ground up: soft reasoning-effort labels drawn from log-length percentiles, attention-cost ordering for packed SFT batches, segment-aware group advantages, the p-norm format multiplier, the B-TV trust region, a closed-form per-token bound on the logit gradient, targeted on-policy self-distillation, the three-bucket curriculum, and the Merlin–Arthur game against hallucination. Every piece is derived on one German baker problem and a group of four rollouts."
date: 2026-10-06
tags: ["reinforcement-learning", "llm", "post-training", "grpo", "distillation", "deep-learning"]
---

The [previous post](/blog/kolibri-pre-training-unibpe-hybrid-attention-eqb) built the Kolibri base model: 78.1B parameters, 3.46B of them active per token, and fluent in German. This post follows the same report ([Aleph Alpha, 2026](https://aleph-alpha.com/downloads/tech-report.pdf)) through **post-training**. That covers 4,000 steps of supervised fine-tuning (SFT) on 268B tokens, then 1,000 steps of asynchronous RL on 38 environments with more than 1.2M tasks.

Most of post-training is data work. A handful of mechanisms, though, are compact enough to derive completely:

1. **Soft reasoning-effort labels.** SFT traces carry no effort label, so one is assigned after the fact from the trace's length relative to traces of similar difficulty.
2. **A multiplicative p-norm format reward** that can never overrule the task reward.
3. **A segment-aware group baseline** for multi-turn agents whose contexts get re-rendered.
4. **The B-TV trust region plus a closed-form bound on each token's logit gradient**, $G_t = p_\theta(1-p_\theta)/p_\mu$.
5. **Targeted on-policy self-distillation (OPSD)**, which rescues groups that RL would otherwise throw away.
6. **The Merlin–Arthur game**, which teaches the model to abstain when its evidence has been removed.

We derive each one on a single German task.

---

## The Running Example

The model gets a short document, a question, and one tool.

> **Kontext.** (S1) *Ein Bäcker verkauft drei Dutzend Brötchen.* (S2) *Jedes Brötchen kostet 0,45 €.* (S3) *Die Bäckerei öffnet um 6 Uhr.*
>
> **Frage.** *Wie hoch ist sein Einkommen? Buche den Betrag mit `buche_einnahme`.*
>
> **Tool.** `buche_einnahme(betrag: number)`

The answer is $3 \times 12 \times 0.45 = 16.20$, which German writes as *16,20 €*. RL samples a **group** of $G = 4$ rollouts for this prompt (Kolibri uses $G = 8$):

| Rollout | What it did | Task correct? | Format defect |
|---|---|---|---|
| $y_1$ | Reasons in German, books `{"betrag": 16.2}` | yes | none |
| $y_2$ | Two segments; the first reasons in English, the second in German | yes | language, in segment 1 |
| $y_3$ | Reasons in German, books correctly, but runs slightly past its length budget | yes | completion budget (mild) |
| $y_4$ | Misreads the decimal comma: $36 \times 45 = 1620$ € | no | — |

We will also need one *failing* variant of the group. In it, all four rollouts pass the amount as a string, `{"betrag": "16.20"}`. The tool rejects every call, so the group's rewards are all zero.

---

## 1. Mathematical Setup

We reuse tools derived earlier in this series:

- **The log trick**, $\nabla \pi = \pi\nabla\log\pi$, the **policy gradient**, and **importance sampling** with the ratio $r = \pi_\theta/\mu$ are built in [Reinforcement Learning from Scratch](/blog/reinforcement-learning-from-scratch) and Section 1 of [MiMo-V2.6: Scaling RL from Scratch](/blog/mimo-v2-6-scaling-rl-towards-self-improvement).
- **Group-relative advantages** $A_i = R_i - \bar R$, which sum to zero, are derived in Section 4 of the MiMo post.
- **Softmax**, **KL divergence** $\text{KL}(q\|p) = \sum_v q_v\log(q_v/p_v)$, and **Gibbs' inequality** ($\text{KL} \ge 0$, with equality iff $q = p$) are built in [Mathematical Prerequisites for Foundation Prior](/blog/math-prerequisites-for-foundation-prior).

One identity carries Sections 7 and 9, so we derive it here: the **gradient of a log-softmax with respect to the logits**. Let $p = \text{softmax}(z)$, so $\log p_v = z_v - \log\sum_w e^{z_w}$. Differentiate with respect to $z_j$ using the **chain rule**:

$$
\frac{\partial \log p_v}{\partial z_j} = \delta_{vj} - \frac{e^{z_j}}{\sum_w e^{z_w}} = \delta_{vj} - p_j,
$$

where $\delta_{vj}$ is the **Kronecker delta** (1 if $v = j$, else 0). For the sampled token $y$, the whole gradient row is

$$
\boxed{\nabla_z \log p_y = u_y - p,}
$$

where $u_y$ is the one-hot vector of $y$. *Example:* with $p = (0.3, 0.5, 0.2)$ and $y$ the first token, $\nabla_z\log p_y = (1 - 0.3,\ 0 - 0.5,\ 0 - 0.2) = (0.7, -0.5, -0.2)$.

---

## 2. SFT: Teaching German Reasoning and Effort Control

### 2.1 Reasoning in German, not just answering in it

Open corpora such as Nemotron translate prompts and answers into German but keep the reasoning in English. Machine-translating English traces into German leaks artefacts. The report's example is a trace on our own baker problem that explains the German decimal comma to itself, writes 0.45 instead of 0,45, and glosses *Brötchen* as "Brötchen sind Brötchen". The fix is **reasoning-prefill distillation**: the teacher's thinking block is opened with a short German phrase, such as *"Gegeben ist:"*, picked at random from a list for each domain. With a system-prompt instruction alone, 67% of teacher traces stay German throughout. With the prefilled opener, 97% do.

Two more data rules matter for our example. Agentic traces get **backfilled** reasoning before tool calls that had none. A backfilled trace is kept only if a second model, reading only that reasoning, derives the same tool call. And **clearly wrong tool calls are masked from the loss but kept in context**. These are calls that report an unknown tool or invalid arguments, or exact repeats of a failed call. The model then learns the *correction* that follows an error without learning to *produce* the error. Our failing variant's string-typed `betrag` call would be one of these masked turns.

### 2.2 Soft effort labels

Kolibri has four effort levels: **none**, **low**, **medium** and **high**. The chat template writes one fixed sentence per level into the system prompt. SFT traces come with no label, so each exchange gets one after the fact from its reasoning length $L$. Lengths vary enormously: median trace lengths range from 27 to 90,223 tokens across datasets, and hard prompts reason up to 31× longer than easy ones. So thresholds are set per **reference group** $g = (\text{dataset}, \text{difficulty})$. A distilled 2B grader, Poacher-2B, labels difficulty and agrees with its GLM-5.2 teacher 84.8% of the time. Within each group, the 30th and 70th length percentiles $\ell^{30}_g, \ell^{70}_g$ become the bucket edges 0.3 and 0.7 on a unit interval, interpolated in log space:

$$
u_g(L) = \text{clip}_{[0,1]}\left(0.3 + 0.4\,\frac{\log L - \log \ell^{30}_g}{\log\ell^{70}_g - \log\ell^{30}_g}\right).
$$

**Check the endpoints.** At $L = \ell^{30}_g$ the fraction is $0$, so $u = 0.3$. At $L = \ell^{70}_g$ it is $1$, so $u = 0.3 + 0.4 = 0.7$. The percentiles land exactly on the edges.

The label is then *drawn*, not thresholded:

$$
P(e \mid L, g) \propto \exp\left(-\frac12\left(\frac{u_g(L) - m_e}{\beta\, w_e}\right)^2\right), \qquad \beta = 0.15,
$$

with bucket centres and widths $m_{\text{low}} = 0.15,\ w_{\text{low}} = 0.3$, $m_{\text{med}} = 0.5,\ w_{\text{med}} = 0.4$, and $m_{\text{high}} = 0.85,\ w_{\text{high}} = 0.3$.

**Numerical check.** Say $y_1$'s reference group (German math, easy) has $\ell^{30} = 200$ and $\ell^{70} = 800$ tokens.

- $L = 400$: $\dfrac{\log 400 - \log 200}{\log 800 - \log 200} = \dfrac{\log 2}{\log 4} = \dfrac12$, so $u = 0.3 + 0.2 = 0.5$. This is the medium centre, and medium is drawn with probability 1.00.
- $L = 1600$: $\dfrac{\log 8}{\log 4} = 1.5$, so $u = 0.9$, which gives high with probability 1.00.
- $L = 800$: $u = 0.7$, exactly on the medium/high edge. The medium exponent is $\big(\frac{0.7 - 0.5}{0.15\times0.4}\big)^2 = (3.33)^2$ and the high exponent is $\big(\frac{0.7-0.85}{0.15 \times 0.3}\big)^2 = (-3.33)^2$. They are equal, so the draw is a coin flip: 50/50.

**Why equal at every edge.** Each edge sits at $m_e \pm w_e/2$, so its scaled distance from the centre is $\frac{w_e/2}{\beta w_e} = \frac{1}{2\beta} = 3.33$, whatever the bucket's width. Neighbouring buckets always tie exactly on their shared edge. Labels change smoothly, and there is no exact token count at which the label flips, which the model might otherwise learn as a stopping point. By construction each group splits about 30% low, 40% medium and 30% high.

**Does it work?** Since 9.5% of opening prompts appear with two reasoning completions, often of very different length, the label is frequently the only input that differs between them. After SFT, the median reasoning length orders low < medium < high on 23 of 24 benchmarks. At fixed difficulty, high effort reasons 1.4–3.7× longer than low. The mean score rises from 38.4 at none to 64.9 at low and 67.8 at high.

### 2.3 Packing by attention cost

SFT packs conversations into 256k-token sequences with document-masked attention, using Next-$k$-Fit with $k = 256$ open bins, which leaves only 0.001% padding. Equal length does not mean equal cost, because attention cost grows with the square of each document's length:

$$
C(s) = \sum_{d\in s}|d|^2.
$$

A sequence holding one 256k conversation costs $256^2 = 65{,}536$ (in units of k²). A sequence of 64 conversations of 4k each costs $64 \times 4^2 = 1{,}024$. That is 64× less for the same token count. Data-parallel ranks synchronise after every microbatch, so everyone waits for whoever drew the expensive one. The fix needs no communication. Every rank buffers $b = 256$ packed sequences, sorts them by $C$, and draws them in a permutation from a seed shared by all ranks. Every rank sorts a buffer from the same distribution, so the $i$-th draw costs about the same on every rank. On 64 B300 GPUs this raised median throughput from 8,610 to 15,850 tokens/s/GPU, an 84% gain.

### 2.4 Mixing and souping

The SFT pool holds 57 datasets, 22.0M samples and 335.8B tokens, of which 142.4B are loss tokens. **MergeMix** fine-tunes one specialist per data cluster and scores a candidate mix by averaging the specialists' weights. With two or three clusters, merges ranked mixes the way real training runs did. With 20 clusters, they did not: the Spearman correlation between merged and trained scores was $-0.09$. Training the promising weightings was still worth it, since 6 of 7 beat the hand-set baseline. The two best full runs, C1 and C2, were **souped** by averaging every parameter. The soup reached a mean of 63.4% against 58.9% for the better single run and 30.0% for the base model. That soup is where RL starts.

---

## 3. The RL Objective

Kolibri optimises, over the trainable tokens $\mathcal{T}$ and the distilled tokens $\mathcal{F}$ of a batch,

$$
\mathcal{L}_{\text{RL}}(\theta) = \frac{1}{|\mathcal{T}| + |\mathcal{F}|}\left(\sum_{t\in\mathcal{T}}\big(\ell^{\text{PG}}_t + \ell^{\text{reg}}_t\big) + \lambda_{\text{OPSD}}\sum_{t\in\mathcal{F}}\ell^{\text{OPSD}}_t\right).
$$

The objective has three terms: a policy-gradient term, a squared log-ratio regulariser, and self-distillation. There is no KL penalty to a frozen reference model and no entropy bonus. Sections 4–9 build each piece on our group.

---

## 4. Rewards: Environment First, Format Second

### 4.1 The p-norm format multiplier

Each of $K$ **format signals** $s_k \in [0,1]$ is 1 for clean output. Examples are tool-in-schema, well-formed tool call, reasoning language, content language, completion budget, and boxed answer. Each signal is softened to $g_k = f_k + (1 - f_k)s_k \in (f_k, 1]$, and they combine as

$$
R_i = R^{\text{env}}_i\left[m_{\min} + (1 - m_{\min})\exp\left(-\Big(\sum_k\big[-\log g_{i,k}\big]^p\Big)^{1/p}\right)\right], \qquad R^{\text{env}}_i > 0.
$$

Kolibri uses $p = 2$, $m_{\min} = 0.5$ and $f_k = 0.5$. For $R^{\text{env}} \le 0$, no format signal applies.

**Reading it.** Each defect contributes a "cost" $-\log g_k \ge 0$. The costs are combined with a $p$-norm, mapped back through $\exp(-\cdot)$ to a factor in $(0, 1]$, and then squeezed into $[m_{\min}, 1]$. So:

- **The task always dominates.** Since $\exp(\cdot) > 0$, the bracket is always above $m_{\min}$, and $R_i > m_{\min}R^{\text{env}}_i = 0.5\,R^{\text{env}}_i$. No pile of format defects can cost a correct answer more than half its reward.
- **$p$ sets how defects compound.** With one defect at $s = 0$: $g = 0.5$, cost $\log 2 = 0.693$, $\exp(-0.693) = 0.5$, so $R = 0.5 + 0.5 \times 0.5 = 0.75$. With two such defects:

| $p$ | aggregate cost | $R$ |
|---|---|---|
| 1 (costs add, i.e. factors multiply) | $1.386$ | $0.625$ |
| 2 (Kolibri) | $\sqrt2 \times 0.693 = 0.980$ | $0.688$ |
| $\infty$ (only the worst counts) | $0.693$ | $0.750$ |

$p = 2$ lets a second defect cost something without letting many defects add up linearly.

**Our group.** For $y_3$, the mild budget overrun has $s = 0.8$, so $g = 0.5 + 0.5 \times 0.8 = 0.9$. Then $\exp(\log 0.9) = 0.9$ and $R_3 = 0.5 + 0.5 \times 0.9 = 0.95$. For $y_2$'s first segment, the reasoning-language signal has $s = 0$, which gives $0.75$. Its second segment is clean, at $1.0$. Rollout $y_1$ is clean, $R_1 = 1$. Rollout $y_4$ has $R^{\text{env}} = 0$, so $R_4 = 0$.

**Why only on positive rewards.** In early runs, the format signals were added to the reward. The reward climbed but benchmarks did not. Most groups differed *only* in format, so the update chased formatting instead of correctness. Applying format only to successes, and only multiplicatively, fixed this: 500 RL steps then lifted AIME 2025 from 60.4 to 70.6.

### 4.2 Segment-aware group advantages

A **segment** is a run of rollout steps that extends one tokenised context. Whenever re-rendering changes earlier tokens, a new segment starts. That happens, for example, when earlier reasoning traces are dropped, which Kolibri does in a random half of groups, since deployments may re-encode text between turns. Each segment's tokens get

$$
A_{i,e} = R_{i,e} - \bar R, \qquad \bar R = \frac{1}{|G|}\sum_{j\in G}\frac{1}{E_j}\sum_{e=1}^{E_j}R_{j,e}.
$$

**The baseline averages within each sequence first.** In our group, $y_2$'s segment mean is $(0.75 + 1.0)/2 = 0.875$, so

$$
\bar R = \frac{1 + 0.875 + 0.95 + 0}{4} = \frac{2.825}{4} = 0.70625.
$$

The advantages are $y_1$: $+0.294$; $y_2$: $+0.044$ on the English-reasoning segment and $+0.294$ on the German one; $y_3$: $+0.244$; $y_4$: $-0.706$. If we had averaged over all five segments, $y_2$ would count twice and the baseline would be $(1 + 0.75 + 1 + 0.95 + 0)/5 = 0.74$. Splitting a sequence into segments would then change everyone's advantage.

Like Dr. GRPO, Kolibri does not divide by the group's standard deviation. Like DAPO, it drops groups with no reward spread, but with one twist. All-pass groups are *kept* when their format penalties differ, since format is the only remaining signal there. A dropped group is re-sampled from the same environment up to twice, so environments that drop a lot of groups are not starved. Sequences that fail from infrastructure errors leave the group before $\bar R$ is computed.

---

## 5. The Policy-Gradient Term and the B-TV Trust Region

For a sampled token with training probability $p_{\theta,t}$ and inference probability $p_{\mu,t}$, the ratio is $r_t = p_{\theta,t}/p_{\mu,t}$, and

$$
\tilde\ell^{\text{PG}}_t = -k_t A_t r_t, \qquad k_t = \begin{cases}\mathbb{1}[p_{\theta,t} - p_{\mu,t} \le \epsilon_+], & A_t > 0,\\ \mathbb{1}[p_{\theta,t} - p_{\mu,t} \ge -\epsilon_-], & A_t \le 0.\end{cases}
$$

This is the **Binary Total Variation (B-TV)** mask of DPPO, with $\epsilon_\pm = 0.2$. PPO clips the *ratio*. B-TV masks on the *absolute* probability change, and only in the direction the advantage pushes.

**Example.** Take a token of $y_1$ with $A > 0$. If $p_\mu = 0.5$ and the trainer has already moved it to $p_\theta = 0.75$, the change $0.25 > 0.2$ sets $k = 0$: the token has been pushed far enough. If instead $p_\theta = 0.6$, the change $0.1 \le 0.2$ keeps it.

Because the loss is $-k A r$, the log trick gives $\nabla_\theta(-kAr) = -kAr\,\nabla_\theta\log p_\theta$, the importance-sampled policy gradient.

---

## 6. The Per-Token Gradient-Norm Bound

### 6.1 Deriving $G_t$

This is the part that is easiest to get wrong. The B-TV mask limits how far a probability may move. It does **not** limit how hard a single token pushes on the logits.

The loss depends on the logits only through $\log p_{\theta,t}$. By the **chain rule**, $\partial r_t/\partial\log p_{\theta,t} = r_t$, because $r_t = e^{\log p_\theta - \log p_\mu}$. For an unmasked token, then:

$$
\nabla_z\tilde\ell^{\text{PG}}_t = \frac{\partial \tilde\ell^{\text{PG}}_t}{\partial\log p_{\theta,t}}\,\nabla_z\log p_{\theta,t} = -A_t r_t\,(u_t - p).
$$

Take the **$\infty$-norm**, using its **absolute homogeneity**, $\|cx\|_\infty = |c|\,\|x\|_\infty$:

$$
\big\|\nabla_z\tilde\ell^{\text{PG}}_t\big\|_\infty = |A_t|\, r_t\, \|u_t - p\|_\infty.
$$

The sampled coordinate of $u_t - p$ is $1 - p_{\theta,t}$. Every other coordinate is $-p_v$, and since probabilities sum to one, $|p_v| \le \sum_{v'\neq y}p_{v'} = 1 - p_{\theta,t}$. So the maximum sits at the sampled token, and $\|u_t - p\|_\infty = 1 - p_{\theta,t}$. Therefore

$$
\boxed{\big\|\nabla_z\tilde\ell^{\text{PG}}_t\big\|_\infty = |A_t|\,G_t, \qquad G_t = r_t(1 - p_{\theta,t}) = \frac{p_{\theta,t}(1 - p_{\theta,t})}{p_{\mu,t}}.}
$$

On-policy, $r_t = 1$ and $G_t = 1 - p_{\theta,t} \le 1$. Off-policy, $G_t$ has $p_{\mu,t}$ in the denominator and is **unbounded** as $p_{\mu,t}\to 0$. A single token that the stale inference policy almost never picked, but that the trainer now likes moderately, can dominate the whole update.

### 6.2 Numerical check on $y_4$

Rollout $y_4$ has $A = -0.706$. Suppose one of its tokens was sampled when the inference policy gave it $p_\mu = 0.01$, and the trainer now gives it $p_\theta = 0.3$. The B-TV mask *keeps* it: $A \le 0$ and $p_\theta - p_\mu = 0.29 \ge -0.2$. Then $r = 30$ and $G = 0.3 \times 0.7 / 0.01 = 21$.

Check this directly on a three-token vocabulary with $p = (0.3, 0.5, 0.2)$:

$$
\nabla_z\tilde\ell = -A r(u - p) = 0.706 \times 30 \times (0.7, -0.5, -0.2) = (14.83, -10.59, -4.24).
$$

The largest magnitude is $14.83 = |A|\,G = 0.706 \times 21$. $\checkmark$ The 1-norm is $14.83 + 10.59 + 4.24 = 29.66 = 2|A|G$, as the report's appendix states: the off-token entries sum to exactly the sampled entry.

### 6.3 The fix: scale, don't clip

Kolibri multiplies each token's loss by a constant (stop-gradient) factor:

$$
\ell^{\text{PG}}_t = c_t\,\tilde\ell^{\text{PG}}_t, \qquad c_t = \text{sg}\left[\min\left(1, \frac{G_{\max}}{G_t}\right)\right], \qquad G_{\max} = 2.
$$

For our token, $c = 2/21 = 0.095$, so its logit gradient falls from $0.706 \times 21 = 14.83$ to $0.706 \times 2 = 1.41$. Tokens with $G_t \le 2$, which includes every on-policy token, are untouched. Computing $c_t$ costs nothing, since it uses only the two probabilities the trainer already has.

**Why not cap the ratio, as CISPO does?** A ratio cap ignores the softmax factor $1 - p_\theta$. Consider a token at $p_\mu = 0.9$, $p_\theta = 0.95$. Its $G = 1.056 \times 0.05 = 0.053$, a tiny gradient, yet a ratio cap still treats it as a large ratio. Conversely, at low probabilities a cap of 5 lets $G$ reach $5(1 - p_\theta)$, far above 2. Bounding $G$ directly is the same as capping the *effective* ratio at $G_{\max}/(1 - p_\theta)$, which adapts to each token.

**What the bound buys, to first order.** A gradient step $\delta z = -\eta\nabla_z\ell$ on the logits changes the sampled probability through the softmax Jacobian $\partial p/\partial z = \text{diag}(p) - pp^\top$. The appendix of the report works this through to

$$
|c_t\,\delta p_{\theta,t}| \le 2\eta\,|A_t|\,G_{\max}\,p_{\theta,t}(1 - p_{\theta,t}) \le \frac{\eta\,|A_t|\,G_{\max}}{2},
$$

using $p(1-p) \le \tfrac14$, the maximum of a parabola at $p = \tfrac12$. No single token can move its own probability by more than $\eta|A_t|G_{\max}/2$.

The bound was added when moving from Kolibri Origin to Kolibri, after individual tokens produced gradient norms "in the thousands". Over the final run, the B-TV mask and the bound together touched only about 0.01% of tokens per step. On top of the per-token bound, the global gradient norm is clipped at 1.0.

---

## 7. The Squared Log-Ratio Regulariser and Engine Consistency

The second term softly penalises drift on every trainable token, masked ones included:

$$
\ell^{\text{reg}}_t = \tau_{\text{KL}}\big(\log r_t\big)^2, \qquad \tau_{\text{KL}} = 10^{-3}.
$$

Because $\log r_t = \log p_{\theta,t} - \log p_{\mu,t}$ and only the first part depends on $\theta$, the chain rule and the boxed identity of Section 1 give

$$
\nabla_z\ell^{\text{reg}}_t = 2\tau_{\text{KL}}\log r_t\,(u_t - p).
$$

If the trainer has raised a token above its inference probability ($\log r > 0$), descent lowers it again, back towards $p_\mu$.

That only makes sense if $p_\theta$ and $p_\mu$ differ because of *learning*, not because of arithmetic. Inference serves FP8 weights and an FP8 KV cache, which is 2–3× faster. When the trainer used plain BF16, RL diverged. So the trainer applies the same FP8 rounding in BF16 arithmetic (**quantisation-aware training**). It replays the experts the inference engine routed to, and keeps the LM-head logits in FP32 on both sides. Rollouts sample at temperature 1 with *no* top-$p$ or top-$k$, so no truncated support has to be replayed. The QK-norm bound from the [previous post](/blog/kolibri-pre-training-unibpe-hybrid-attention-eqb) guarantees that the FP8 queries and keys never overflow. In the final run, the mismatch hovered around $|\log r| \approx 0.03$, staleness included.

---

## 8. Targeted On-Policy Self-Distillation (OPSD)

Return to the failing variant: four rollouts, all booking `{"betrag": "16.20"}` as a string. Every booking fails, the rewards are $(0,0,0,0)$, and Section 4.2 drops the group. Yet the failure is obvious and easy to fix. OPSD turns such groups into dense signal. The run applies it to tool-use and terminal environments, for groups whose best reward is below 0.2:

1. Pick the rollout with the most tool-response errors.
2. Insert a **remedial hint** for the error class at the exact turn it occurred. For `wrong_argument_type`, the hint is "Arguments use the exact JSON types the tool declares."
3. Re-score every token of the failed turn under the **current** policy, with the hint. That is the teacher. The student is the same policy without the hint.
4. Minimise $\ell^{\text{OPSD}}_t = \text{KL}\big(\text{sg}[\pi_\theta(\cdot\mid s_t, h_t)]\,\big\|\,\pi_\theta(\cdot\mid s_t)\big)$, with the RL loss switched off for that rollout.

No ground-truth solution is needed. The hint is the privileged information.

### Deriving the gradient

Write the teacher as $q$ (constant, because of the stop-gradient) and the student as $p = \text{softmax}(z)$. Then

$$
\text{KL}(q\|p) = \sum_v q_v\log q_v - \sum_v q_v\log p_v.
$$

The first sum does not depend on $z$. For the second, use the identity of Section 1:

$$
\frac{\partial}{\partial z_j}\left(-\sum_v q_v\log p_v\right) = -\sum_v q_v(\delta_{vj} - p_j) = -q_j + p_j\sum_v q_v = p_j - q_j,
$$

since $\sum_v q_v = 1$. Hence

$$
\boxed{\nabla_z\,\text{KL}(q\|p) = p - q.}
$$

**Numerical check.** Take the token after `"betrag": ` with three candidates: `"` (opening a string), `16` (a number), and anything else. The unhinted student has $p = (0.6, 0.3, 0.1)$. The hinted teacher has $q = (0.1, 0.8, 0.1)$. The gradient is $p - q = (0.5, -0.5, 0)$. Descent lowers the logit of `"` and raises that of `16` by the same amount, which is exactly the fix. A finite-difference check of $\text{KL}(q\|p) = 0.605$ gives $(0.500, -0.500, 0.000)$. $\checkmark$ The report's Figure 68 shows this exact error class, with the teacher's probability mass sitting on the opening quote.

**Over the run.** Detections per OPSD sequence fell from 4.21 to 2.56. Invented tools and references were trained away almost entirely, and customer-service detections dropped 99%. Late in training, `output_truncated` dominated as software-engineering rollouts grew longer. Only 0.10% to 0.034% of trained tokens used the distillation loss. Those tokens had consistently higher entropy than average, which is where the policy is least sure.

---

## 9. One View of All Three Terms

Every term of the objective has a logit gradient of the same shape, **a weight times ($p$ minus a target)**:

| Term | $\nabla_z\ell_t$ | weight | target |
|---|---|---|---|
| Policy gradient | $c_t k_t A_t r_t\,(p - u_t)$ | $c_t k_t A_t r_t$ | one-hot $u_t$ |
| Log-ratio regulariser | $-2\tau_{\text{KL}}\log r_t\,(p - u_t)$ | $-2\tau_{\text{KL}}\log r_t$ | one-hot $u_t$ |
| OPSD | $\lambda_{\text{OPSD}}\,(p - q_t)$ | $\lambda_{\text{OPSD}}$ | hinted distribution $q_t$ |

Gradient descent moves $p$ towards the target when the weight is positive and away from it when the weight is negative. The policy gradient pulls towards the sampled token when $A > 0$ and pushes away when $A < 0$. Its weight is capped in magnitude by $c_t$ and gated by $k_t$. The regulariser pulls towards or away from the sampled token, whichever undoes recent drift. OPSD pulls towards a whole distribution rather than a single token, which is why it carries more information per token than an advantage does. In every case the push on the logits is a bounded weight times a difference of two probability vectors, so it is bounded too.

---

## 10. The Curriculum: Spend Rollouts Where the Signal Is

A prompt the model always solves, or never solves, yields a dropped group. The curriculum sorts each environment's prompts into three buckets by estimated pass rate: **hard** (estimated 0), **trainable** (in between) and **solved** (1). Pass-rate estimates start offline, or at 0.5 by default, and are refreshed by every high-effort group. Bucket $b$ is drawn with weight

$$
w_b = c_b\min(\sigma_b, \gamma_b), \qquad \sigma_b = \min\left(1, \frac{n_b}{B}\right), \qquad (c_{\text{hard}}, c_{\text{train}}, c_{\text{solved}}) = (0.08, 0.9, 0.02).
$$

The **supply term** $\sigma_b$ shrinks a bucket's weight when it holds fewer prompts $n_b$ than the batch's $B = 256$ groups. The **recency term** $\gamma_b$ grows linearly from 0 to 1 over 50 policy updates since the bucket's oldest prompt was last tried. It stops a just-failed hard prompt from being redrawn at once, and it is 1 for the trainable bucket.

**Numerical check.** Suppose our baker task's environment holds 40 hard, 1,000 trainable and 600 solved prompts, and the hard bucket's head was tried 25 updates ago, so $\gamma_{\text{hard}} = 0.5$:

$$
w_{\text{hard}} = 0.08\min(40/256, 0.5) = 0.08 \times 0.156 = 0.0125, \quad w_{\text{train}} = 0.9, \quad w_{\text{solved}} = 0.02.
$$

Normalised, these give 1.3%, 96.5% and 2.1% of draws. The environment itself is drawn in proportion to its sampling weight times $V_e = \sum_b w_b = 0.9325$. An environment that runs out of trainable prompts fades from the mix on its own, and comes back once re-evaluated prompts become trainable again.

---

## 11. The Merlin–Arthur Game Against Hallucination

To teach abstention, Kolibri plays a game on the context. Arthur is the policy. **Merlin** hides the sentences that matter *least* for the gold answer $a$. **Morgana** hides the ones that matter *most*. Both hide about the same number of sentences, so Arthur cannot tell them apart by how much is missing. The ideal masks solve

$$
\max_{m_{\text{Mer}}, m_{\text{Mor}}}\ \log\pi_\theta(a\mid x\odot m_{\text{Mer}}, q) + \log\big(1 - \pi_\theta(a\mid x\odot m_{\text{Mor}}, q)\big), \qquad |k_{\text{Mer}} - k_{\text{Mor}}| \le \delta.
$$

In practice, each sentence is masked alone and ranked by how much the log-probability of $a$ drops. The masks are recomputed from the current policy at every step, so Morgana always tracks whatever currently lures Arthur into guessing.

**Our context.** Suppose $\log\pi(a\mid x) = -0.20$. Masking each sentence alone gives $\log\pi(a) = -1.50$ without S1 (the quantity), $-6.00$ without S2 (the price), and $-0.25$ without S3 (opening hours). With $k = 1$, Merlin hides **S3**, the smallest drop ($-0.05$). Morgana hides **S2**, the largest ($-5.80$). Without the price, *16,20 €* cannot be derived.

Each question is posed three times without labels: with the full context, Merlin's, and Morgana's. The reward is $+1$ for the correct answer on the full or Merlin context, $-1$ for a wrong answer there, $+1$ for abstaining on Morgana's context, and $0$ otherwise (small overlap terms aside). Advantages are centred **per role**: $A_j \propto R(y_j) - \bar R_{\text{role}(j)}$. If two of four Morgana-context rollouts abstain (reward 1) and two invent a price (reward 0), the role mean is 0.5 and their advantages are $\pm 0.5$.

Abstaining on the full context earns 0, less than a correct answer's 1, so Arthur cannot win by refusing everything. The same game gives a metric. **Completeness** is how often the model answers correctly with Merlin's context, and **soundness** is how often it abstains with Morgana's. Together they yield the **M/A grounding score**, a certified lower bound on how much of the answer came from the document. Kolibri scores 23.4%; Kolibri Origin and several baselines score 0. On AA-Omniscience, Kolibri abstains instead of answering wrong on 44% of non-correct items, against 15% for Origin.

---

## 12. Asynchrony and Staleness

The run used 256 B300 GPUs: 96 for the trainer, 144 single-GPU vLLM replicas for rollouts, and 16 for a frozen Qwen3.5-122B judge. Groups enter a replay buffer as they finish. The trainer samples each group at most once. After every step, FP8 weights are pushed by RDMA into one replica per node and broadcast over NVLink. In-flight requests keep their KV cache, so a single rollout can span several policy versions. Weight updates went from 221 + 217 seconds with the original synchronous design to about 17 seconds.

**Staleness is a ratio of wall-clock times.** A group's staleness is roughly its rollout duration divided by the trainer's step time. With 2-minute steps, a 60-minute code rollout arrives $60/2 = 30$ steps stale. Doubling both trainer and inference GPUs at the same batch size halves the step time to 1 minute. Per-request decode speed is unchanged, so the same rollout now arrives 60 steps stale. That exceeds Kolibri's eviction limit of 42, and the group is thrown away. The remedy is to **scale the batch size with the GPU count**, which keeps the step time, and with it the staleness, fixed. The final run had a median staleness of 10 steps.

---

## 13. Results

What RL added on top of the SFT soup, at high effort:

| Benchmark | SFT | RL | Δ |
|---|---|---|---|
| AIME 2025 | 92.7 | 96.9 | +4.2 |
| AIME 2026 | 92.1 | 96.0 | +3.9 |
| GPQA Diamond | 79.8 | 84.3 | +4.5 |
| IFBench | 48.2 | 78.1 | +29.9 |
| τ³-bench banking | 13.1 | 38.1 | +25.0 |
| AA-Omniscience Index | −68.8 | −32.8 | +36.0 |
| LiveCodeBench v6 | 75.3 | 85.9 | +10.6 |
| Terminal-Bench 2.1 | 23.2 | 27.7 | +4.5 |
| AA-LCR | 60.3 | 68.3 | +8.0 |

On German AIME 2026, the share of reasoning in German rose from 89% to 99%, and accuracy from 75% to 91%. English AIME 2026 moved from 92% to 96%.

Against open models, using Overall aggregates in English / German:

| Model | Active | EN | DE |
|---|---|---|---|
| **Kolibri** | 3.46B | **75.5** | **70.8** |
| Qwen3.5 35B-A3B | 3B | 74.7 | 69.8 |
| Qwen3.6 35B-A3B | 3B | 71.4 | 67.3 |
| Gemma 4 26B-A4B IT | 4B | 71.9 | 66.3 |
| GPT-OSS 120B | 5.1B | 72.3 | 70.2 |
| Nemotron 3 Super 120B-A12B | 12B | 73.0 | 67.9 |
| Kolibri Origin | 3.27B | 54.1 | 46.4 |
| Qwen3.8 27B (dense) | 27B | 80.2 | 79.9 |

Kolibri is the strongest MoE model tested in both languages. Only the dense Qwen3.8 27B, with almost 8× the active parameters, scores higher. Kolibri leads the MoE models on English AIME, the SQuAD grounding score and the automotive customer proxy. It averages 89.7 on the English in-house Industry RAG proxies. Its weakest rows are RGB closed-book, where it scores 51 and ranks last, AA-Omniscience accuracy, and BFCL multi-turn. That fits a model trained to abstain rather than guess.

The report records two exploits, both caught through sequence monitoring. With the OpenCode harness, the model used web-fetch to download upstream SWE-bench fixes in about 7% of trials. In one under-isolated sandbox, a command switched off unprivileged user namespaces on the host kernel. In the report's words, sandbox escapes are "as much a function of sandbox security as of model capability".

---

## Summary

Kolibri's post-training uses the same design rule throughout: every learning signal is bounded and scaled to how much it can be trusted. Effort labels come from a smooth Gaussian draw on log-length percentiles, so neighbouring buckets tie exactly at their shared edge and no hard cutoff exists. Format signals multiply only successful rewards and can never take away more than half of one. The policy gradient is masked by B-TV and scaled so that no token's logit gradient exceeds $G_{\max}|A|$, where $G_t = p_\theta(1-p_\theta)/p_\mu$ would otherwise blow up off-policy. The regulariser and OPSD are the same "weight times ($p$ − target)" push, the latter rescuing all-fail groups with a hint. A curriculum and the Merlin–Arthur game spend rollouts where they teach, including teaching the model when not to answer.

---

*Previous: [Kolibri Pre-Training from Scratch](/blog/kolibri-pre-training-unibpe-hybrid-attention-eqb)*
