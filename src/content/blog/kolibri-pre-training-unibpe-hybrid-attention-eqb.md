---
title: "Kolibri Pre-Training from Scratch: UniBPE, Hybrid Attention and Exact Quantile Balancing"
description: "Building Aleph Alpha's Kolibri base model from the ground up: the Unigram-loss merge score of UniBPE and why it is pointwise mutual information in disguise, the KV-cache arithmetic of 40 sliding-window and 10 NoPE blocks, sigmoid MoE routing with Exact Quantile Balancing and Load-Error Injection, the 1 − K/E signature of a router the bias has overridden, and the cumulative-learning-rate law behind hyperparameter transfer. Every step is derived on one German sentence and four tokens."
date: 2026-10-06
tags: ["llm", "pre-training", "tokenizers", "mixture-of-experts", "attention", "deep-learning"]
---

Aleph Alpha's **Kolibri** ([Aleph Alpha, 2026](https://aleph-alpha.com/downloads/tech-report.pdf); weights at [Aleph-Alpha/kolibri-1](https://huggingface.co/Aleph-Alpha/kolibri-1)) is an English–German Mixture-of-Experts model with 78.1B total and 3.46B active parameters per token. That is 4.4% of the weights per token. It was trained on 24T tokens, more than a fifth of them German, and released under Apache 2.0. Among the open models the report compares, it sits on the Pareto frontier of quality against serving cost in both languages.

The report runs to 189 pages and covers every stage, from Common Crawl to RL. This post follows one thread: the **base model**. Four design choices make it cheap per token and strong in German. Each is derived here from scratch:

1. **UniBPE**, a tokeniser that builds merges bottom-up like BPE but ranks them by the Unigram loss.
2. **Hybrid attention**: 40 sliding-window blocks with RoPE and 10 full-attention blocks with no positional encoding.
3. **Sigmoid MoE routing**, balanced by **Exact Quantile Balancing (EQB)** across the whole batch and **Load-Error Injection (LEI)** inside each microbatch.
4. **Hyperparameter transfer** by loss extrapolation in the cumulative-learning-rate coordinate.

The companion post, [Kolibri Post-Training from Scratch](/blog/kolibri-post-training-effort-labels-format-rewards-gradient-bound), covers SFT and RL.

---

## The Running Example

We follow one German sentence through the model:

> *Die Zeitung erscheint täglich.* ("The newspaper appears daily.")

The tokeniser has to decide how to cut *Zeitung*. German forms thousands of nouns with the suffix *-ung* (*Zeitung, Ordnung, Wohnung, Rechnung*), so a good tokeniser should learn **ung** as a unit. We will watch UniBPE choose **ung** where plain BPE chooses something else.

The first four tokens of the sentence are then

$$
t_1 = \text{"Die"},\quad t_2 = \text{" Zeit"},\quad t_3 = \text{"ung"},\quad t_4 = \text{" erscheint"}.
$$

In the MoE sections these four tokens meet a toy MoE layer with $E = 4$ routed experts and top-$K = 2$ routing. Kolibri itself has $E = 384$ and $K = 6$. The router has collapsed onto two experts, and we will watch EQB repair it in one update.

---

## 1. Mathematical Setup

Earlier posts in this series derive most of the tools we need:

- **Logarithm rules**, the **softmax**, and **entropy** $H(p) = -\sum_v p_v \log p_v$ are built in [Mathematical Prerequisites for Mixture of Experts](/blog/math-prerequisites-for-mixture-of-experts).
- **Top-$K$ routing**, **sigmoid routing scores**, and **expert-bias load balancing** are built in [MoE Load Balancing from Scratch](/blog/mixture-of-experts-load-balancing-from-scratch).
- **Sliding-window attention** and **grouped-query attention (GQA)** are built in [Sliding-Window Attention](/blog/attention-sliding-window) and [Grouped-Query Attention](/blog/attention-gqa).

We also need two small definitions.

**The function $h$.** Write $h(x) = x \log x$ with $h(0) = 0$. This is the continuous extension, since $x \log x \to 0$ as $x \to 0^+$. Its derivative, by the **product rule**, is

$$
h'(x) = \log x + x \cdot \frac{1}{x} = \log x + 1.
$$

**Quantiles.** For a list of numbers, $Q_m(\cdot)$ denotes its $(m+1)$-th largest entry. For example, $Q_2(3.0, 1.5, 0.5, 3.0) = 1.5$: sorted descending, the list is $3.0, 3.0, 1.5, 0.5$, and the third entry is $1.5$.

---

## 2. Kolibri at a Glance

| | Kolibri Origin | Kolibri |
|---|---|---|
| Blocks | 50 | 50 |
| Full-attention / SWA blocks | 50 / 0 | 10 / 40 |
| SWA window | — | 512 preceding tokens |
| Width | 2048 | 2560 |
| Query / KV heads (dim 128) | 32 / 4 | 48 / 4 |
| Leading dense blocks | 2 | 0 |
| Routed experts, top-$K$ | 128, 8 | 384, 6 |
| Shared experts | 1 | 1 |
| Routed-expert hidden dim | 768 | 512 |
| Total / active parameters | 30.6B / 3.27B | 78.1B / 3.46B |
| Pre-training tokens | 8T | 24T |
| Context | 64k | 256k trained, 1M usable |

Kolibri Origin was an internal model that validated the whole pipeline at scale. In the three months between the two, almost every stage changed. Each block uses **sandwich normalisation**: an RMSNorm before *and* after both the attention and the MoE sublayers. Training ran on 768 B200 GPUs: 20T tokens of pre-training at 16k context, 3.44T of mid-training at 64k, and 200B of long-context extension at 256k.

The sparsity is $3.46/78.1 = 0.0443$, or 4.4%. Origin activated $3.27/30.6 = 10.7\%$.

---

## 3. UniBPE: Choosing Merges by the Unigram Loss

### 3.1 Two ways to build a vocabulary

**Byte Pair Encoding (BPE)** builds a vocabulary bottom-up. It starts from bytes and repeatedly merges the adjacent pair $(a, b)$ that occurs most often, $c_{ab}$ times, into a new token $ab$. **Unigram** tokenisers work top-down. They start from a huge vocabulary and prune the tokens whose removal hurts a likelihood the least. UniBPE keeps BPE's procedure but swaps its ranking criterion for Unigram's likelihood.

### 3.2 The Unigram loss of a tokeniser state

A tokeniser state gives every token $t$ a count $c_t$ over the training corpus, with $N = \sum_t c_t$ tokens in total. The **Unigram model** assigns token $t$ the probability $c_t/N$. The negative log-likelihood of the corpus under this model is the sum, over every token occurrence, of $-\log(c_t/N)$. Token $t$ occurs $c_t$ times, so

$$
\mathcal{L} = -\sum_t c_t \log\frac{c_t}{N}.
$$

Split the logarithm with the **logarithm quotient rule**, $\log(c_t/N) = \log c_t - \log N$:

$$
\mathcal{L} = -\sum_t c_t \log c_t + \log N \sum_t c_t = -\sum_t h(c_t) + N \log N.
$$

The second sum is $\sum_t c_t = N$, so the last term is $N\log N = h(N)$:

$$
\boxed{\mathcal{L} = h(N) - \sum_t h(c_t).}
$$

$\mathcal{L}$ is $N$ times the entropy of the unigram distribution. Lower $\mathcal{L}$ means a shorter, more predictable token stream. Unigram tokenisers minimise it top-down by pruning tokens. UniBPE minimises it bottom-up, by merging.

### 3.3 The change of the loss under one merge

Merge the pair $(a, b)$, with $a \neq b$, which occurs $c_{ab}$ times. Exactly four counts change:

- $a$ loses $c_{ab}$ occurrences: $c_a \to c_a - c_{ab}$.
- $b$ loses $c_{ab}$ occurrences: $c_b \to c_b - c_{ab}$.
- The new token $ab$ appears with count $c_{ab}$ (from $0$).
- The corpus gets shorter by $c_{ab}$ tokens: $N \to N - c_{ab}$, because two tokens become one each time.

Every other count is untouched, so its $h$ term cancels in the difference. Substitute into the boxed $\mathcal{L}$ and subtract. Each $-h(c)$ term flips sign when it moves to the other side:

$$
\Delta \mathcal{L} = \underbrace{h(c_a) - h(c_a - c_{ab})}_{a \text{ loses } c_{ab}} + \underbrace{h(c_b) - h(c_b - c_{ab})}_{b \text{ loses } c_{ab}} - \underbrace{h(c_{ab})}_{\text{new token}} + \underbrace{h(N - c_{ab}) - h(N)}_{\text{shorter corpus}}.
$$

BPE ranks candidates by $c_{ab}$ alone. UniBPE ranks them by $\Delta\mathcal{L}$, most negative first. Both need only the pair count and the two parent counts, so UniBPE costs nothing extra over BPE.

### 3.4 Numerical check: *ung* against *en*

Suppose our tokeniser has already merged *n* + *g* into **ng**. The state now holds the counts $c_e = 40$, $c_n = 30$, $c_u = 6$, $c_{ng} = 8$, and $N = 100$ tokens in total. Two candidate merges compete:

- **(e, n)**, the very frequent German ending *-en*, occurs $c_{en} = 12$ times.
- **(u, ng)**, the suffix *-ung*, occurs $c_{u,ng} = 6$ times. Every *u* in this corpus is followed by *ng*.

**BPE** takes $(e, n)$, since $12 > 6$.

**UniBPE on (e, n).** The values of $h$ we need are $h(40) = 147.555$, $h(28) = 93.302$, $h(30) = 102.036$, $h(18) = 52.027$, $h(12) = 29.819$, $h(88) = 394.006$, and $h(100) = 460.517$. Then

$$
\Delta\mathcal{L}_{en} = (147.555 - 93.302) + (102.036 - 52.027) - 29.819 + (394.006 - 460.517)
$$

$$
= 54.253 + 50.009 - 29.819 - 66.511 = +7.932.
$$

The merge *raises* the loss.

**UniBPE on (u, ng).** Here $c_u - c_{u,ng} = 0$ and $h(0) = 0$, so the first bracket is $h(6)$, which cancels exactly against the new-token term $-h(6)$:

$$
\Delta\mathcal{L}_{ung} = \big(h(6) - 0\big) + \big(h(8) - h(2)\big) - h(6) + \big(h(94) - h(100)\big) = (16.636 - 1.386) + (427.070 - 460.517) = -18.198.
$$

The merge lowers the loss by 18.2. UniBPE merges **ung**, and *Zeitung* becomes *Zeit* + *ung*.

### 3.5 What $\Delta\mathcal{L}$ really measures: pointwise mutual information

Why does the rarer pair win? When $c_{ab}$ is small compared with $c_a$, $c_b$ and $N$, each difference $h(x) - h(x - c_{ab})$ is well approximated by $c_{ab}\, h'(x) = c_{ab}(\log x + 1)$. This is a **first-order Taylor approximation**. Applying it to the three differences:

$$
\Delta\mathcal{L} \approx c_{ab}(\log c_a + 1) + c_{ab}(\log c_b + 1) - c_{ab}\log c_{ab} - c_{ab}(\log N + 1).
$$

The $+1$ terms give $1 + 1 - 1 = 1$. Collecting the logarithms with the **logarithm product and quotient rules**:

$$
\Delta\mathcal{L} \approx -c_{ab}\left[\log\frac{c_{ab}\, N}{c_a\, c_b} - 1\right] = -c_{ab}\,\big(\text{PMI}(a, b) - 1\big),
$$

where $\text{PMI}(a,b) = \log \dfrac{c_{ab}/N}{(c_a/N)(c_b/N)}$ is the **pointwise mutual information** of the pair. It is large when $a$ and $b$ co-occur far more often than independent tokens would.

So BPE ranks by **frequency** alone, while UniBPE ranks by **frequency × (PMI − 1)**. A merge lowers the loss only if the pair is more associated than chance by a factor of more than $e$.

**Check on our pairs.** For $(e,n)$, $\text{PMI} = \log\frac{12 \times 100}{40 \times 30} = \log 1 = 0$. The two letters co-occur exactly as often as chance predicts. The approximation gives $-12(0 - 1) = +12$, and the exact value is $+7.9$; both are positive. For $(u,ng)$, $\text{PMI} = \log\frac{6\times100}{6 \times 8} = \log 12.5 = 2.53$. The approximation gives $-6(2.53 - 1) = -9.2$, and the exact value is $-18.2$; both are negative. The magnitudes differ because $c_{ab}$ is not small here (all six *u* are consumed), but the sign and the ranking agree.

This is why UniBPE lands on morphemes. A suffix like *-ung* or a prefix like *ver-* is a highly associated unit, while *-en* is a frequent but weakly associated letter pair. In the first 60 merges on the pre-training data, UniBPE produces *und, ung, ver* and the characters *ü, ä, ö, ß*. BPE has no German units at all by merge 60.

### 3.6 The production tokeniser

Pure UniBPE was used for Kolibri Origin and hurt compression, because some useful merges are hard for it. One example is joining `..` into `...`. Kolibri's tokeniser is therefore a hybrid. Starting from 256 byte tokens, it performs $120{,}000 - 256 = 119{,}744$ UniBPE merges, then 7,900 standard BPE merges, then adds 100 reserved and special tokens. That makes 128,000 tokens. Digits are split one per token, and the tokeniser was trained on a 100 GB slice of the pre-training data.

| | Kolibri | GPT-5 | Plain BPE (same data) |
|---|---|---|---|
| Vocabulary | 128,000 | 200,019 | 128,000 |
| German bytes/token | **4.90** | 4.35 | 4.89 |
| English bytes/token | 4.58 | **4.67** | 4.59 |
| German morpheme precision | **65.2%** | 47.3% | 60.2% |
| English morpheme precision | **50.0%** | 40.1% | 36.4% |

**Morpheme precision** is the share of word-internal token boundaries that fall on a true morpheme boundary. Kolibri compresses German best of the twelve tokenisers tested, needing 11.2% fewer tokens than GPT-5, and stays close on English. In a matched ablation at proxy scale, it reaches the same bits per byte as plain BPE but higher recall on long-context variable tracking and key-value retrieval at every length.

---

## 4. Hybrid Attention: 40 Windows and 10 Global Blocks

Kolibri uses full attention in every fifth block (10 of 50). The other 40 blocks use **sliding-window attention (SWA)** over the 512 preceding tokens. All blocks use GQA with 48 query heads and 4 KV heads of dimension 128.

### 4.1 KV-cache arithmetic

The **KV cache** stores each layer's keys and values for past tokens. Per token and per layer, it holds

$$
2 \times (\text{KV heads}) \times (\text{head dim}) = 2 \times 4 \times 128 = 1024 \text{ numbers},
$$

where the factor 2 counts keys and values. A full-attention block keeps this for all $L$ tokens of the context. A SWA block keeps it for at most $w = 512$, since older tokens are never attended again. The cache of one request is therefore

$$
\text{KV}(L) = 1024 \times \big(10\, L + 40 \times 512\big).
$$

At $L = 256\text{k} = 262{,}144$:

$$
10 \times 262{,}144 + 40 \times 512 = 2{,}621{,}440 + 20{,}480 = 2{,}641{,}920, \qquad \text{KV} = 1024 \times 2{,}641{,}920 = 2.705 \times 10^9.
$$

That is 2.705 GB per 256k-token request with an FP8 cache (one byte per number). All-full attention would need $1024 \times 50 \times 262{,}144 = 13.42$ GB, which is $13.42/2.705 = 4.96\times$ more. The 40 SWA blocks contribute $20{,}480 / 2{,}641{,}920 = 0.8\%$ of the cache.

**Numerical check against the report.** The report's Table 31 estimates how many concurrent 256k-token FP8 requests fit on two H100s, for three model sizes from its sparsity sweep. It assumes a 10% fragmentation margin and 6 GB of activation workspace per GPU. Rebuilding the estimate:

$$
\text{requests} = \left\lfloor \frac{0.9 \times (2 \times 80\,\text{GB}) - 2 \times 6\,\text{GB} - P\,\text{GB}}{2.705\,\text{GB}} \right\rfloor,
$$

where the $P$ billion parameters occupy $P$ GB in FP8. For $P = 42.1$: $(144 - 12 - 42.1)/2.705 = 33.2 \to 33$. For $P = 82.3$: $(132 - 82.3)/2.705 = 18.4 \to 18$. For $P = 122.6$: $(132 - 122.6)/2.705 = 3.5 \to 3$. All three match the report (33, 18 and 3). Applying the same formula to Kolibri's 78.1B gives $(132 - 78.1)/2.705 = 19.9$, so 19 concurrent 256k-token requests.

### 4.2 Choosing $w = 512$

The window was swept from 128 to 4096 at proxy scale M (7.8B total, 0.6B active). FLOPs, KV cache and parameters were matched by adapting the SWA heads and expert widths. Pre-training scores barely moved. On the pooled long-context score, $w = 128$ led up to 64k but degraded at 128k. Validated at the larger scale L, $w = 128$ and $w = 512$ scored 48.0% and 47.8% on pre-training benchmarks, but $w = 512$ led by 6.7 points at 256k. Kolibri takes $w = 512$, at a cost of 0.2 points of short-context accuracy.

### 4.3 RoPE only in the window, nothing in the global blocks

The SWA blocks use RoPE with $\theta = 10{,}000$. The full-attention blocks use **no positional encoding (NoPE)**. A SWA block only ever sees relative offsets in $[0, 512]$, all of which it saw during training. A NoPE block has no notion of position at all. So the model never meets a relative position larger than any it was trained on, and it runs beyond its 256k training length without positional rescaling. At 1M tokens on RULER, Kolibri Base scores 63.2, above Nemotron 3 Nano Base (58.5) and Qwen3.5 Base with static YaRN (57.5).

### 4.4 QK normalisation also makes FP8 safe

Every block RMS-normalises queries and keys per head before RoPE: $\hat q = \gamma \odot q/\text{RMS}(q)$ with $\text{RMS}(q) = \sqrt{\|q\|_2^2/d_h + \varepsilon}$. That bounds every element. Ignoring $\varepsilon$,

$$
\left|\frac{q_i}{\text{RMS}(q)}\right| = \frac{|q_i|\sqrt{d_h}}{\|q\|_2} \le \sqrt{d_h},
$$

because a single coordinate can never exceed the vector's length, $|q_i| \le \|q\|_2$. With $d_h = 128$, every normalised element is at most $\sqrt{128} \approx 11.3$ times its gain. RoPE is a rotation and preserves the bound. So as long as the gains stay below $448/11.3 \approx 39.6$, no query or key can exceed 448, the largest FP8 E4M3 value, and the FP8 KV cache used in RL cannot overflow. At proxy scale, removing QK normalisation made training diverge at the baseline learning rates. Keeping it only in the SWA blocks still produced gradient-norm spikes of several orders of magnitude.

---

## 5. How Sparse? The 80B Decision

At fixed expert width and top-$K$, adding experts raises the total parameter count but leaves FLOPs per token almost unchanged. The sweep held 3.4B active parameters and tried 128, 256 and 384 routed experts, giving 42.1B, 82.3B and 122.6B total. Going from 42.1B to 82.3B clearly improved loss and accuracy. Going to 122.6B helped only slightly.

Total size is not free at inference. Decode is memory-bound, so every expert weight that has to be read costs time. At 4k context, the 82.3B and 122.6B models decode 13% and 32% slower than the 42.1B one. At 256k, where KV reads dominate, the gaps shrink to 4% and 12%. The deployment footprint is the Section 4.1 calculation: 18 long requests for 82.3B on two H100s, against 3 for 122.6B. Kolibri targets about 80B total.

With the size fixed, two ablations set the shape. For expert granularity at roughly 80B, 6-of-384 experts of width 512 (loss 1.847) beat 12-of-512 (1.848) and 6-of-256 of width 1024 (1.860). For residual width at matched FLOPs, wider was better: width 1600 reached loss 2.109, against 2.132 for width 1024.

---

## 6. Routing and the Two Kinds of Balance

### 6.1 The routing equations

For $T$ tokens and $E$ routed experts, the router produces logits $Z \in \mathbb{R}^{T\times E}$. A bias vector $\beta \in \mathbb{R}^E$ is added for **selection only**:

$$
B = Z + \mathbf{1}_T \beta^\top, \qquad I_t = \text{Top-}K(B_{t,:}), \qquad S_{t,e} = \sigma(Z_{t,e}),
$$

$$
y_t = f_{\text{shared}}(x_t) + \sum_{e\in I_t} S_{t,e}\, f_e(x_t).
$$

Two details matter. The mixture weights are the *unbiased* sigmoid scores, so $\beta$ decides *who* is chosen but not *how much* they contribute. And the selected scores are *not renormalised* to sum to one.

**The running example.** Our four tokens produce these logits:

| | $e_1$ | $e_2$ | $e_3$ | $e_4$ | Top-2 |
|---|---|---|---|---|---|
| $t_1$ "Die" | 2.0 | 0.5 | −2.0 | −1.0 | $e_1, e_2$ |
| $t_2$ " Zeit" | 2.0 | 3.0 | 0.5 | −1.0 | $e_1, e_2$ |
| $t_3$ "ung" | 0.0 | 2.0 | −0.5 | −1.0 | $e_1, e_2$ |
| $t_4$ " erscheint" | 2.0 | 0.0 | −1.5 | −1.0 | $e_1, e_2$ |

With $\beta = 0$, every token picks $\{e_1, e_2\}$. The loads are $c = (4, 4, 0, 0)$, and experts 3 and 4 receive no tokens and no gradient.

### 6.2 Measuring imbalance: MaxVio

The target load is $K|B|/E$: each of $|B|$ tokens makes $K$ choices, spread evenly over $E$ experts. Here it is $2 \times 4/4 = 2$. The **maximum violation** is

$$
\text{MaxVio}(B) = \max_e \left[\frac{c_e(B)}{K|B|/E} - 1\right] = \frac{4}{2} - 1 = 1.0.
$$

The busiest expert carries twice its share. There are two distinct requirements. **Global balance**, over the whole optimiser-step batch, ensures every expert gets learning signal. **Local balance**, within each microbatch, keeps expert-parallel GPUs equally busy. Over the Kolibri pre-training run, the global MaxVio averaged 0.31 across layers.

---

## 7. Exact Quantile Balancing (EQB)

### 7.1 Quantile Balancing

Quantile Balancing computes a token bias $\alpha_t$ and an expert bias $\beta_e$ by alternating quantile updates:

$$
\alpha_t \leftarrow -Q_K\big(Z_{t,:} + \beta^\top\big), \qquad \beta_e \leftarrow -Q_r\big(Z_{:,e} + \alpha\big), \qquad r = \frac{TK}{E}.
$$

**Why the minus sign.** Subtracting the $(m+1)$-th largest entry of a list from every entry leaves exactly $m$ entries positive, assuming no ties. So adding $\alpha_t$ to row $t$ leaves exactly $K$ positive entries, one per selection. Adding $\beta_e$ to column $e$ leaves exactly $r$ positive entries, which is that expert's fair share. Each training step performs one token update and then one expert update. The expert biases are centred (their mean is subtracted), and routing uses the top-$K$ of $Z + \beta$. The token biases are discarded; per-token top-$K$ approximates them.

### 7.2 Numerical check: one update repairs the collapse

Here $T = 4$, $E = 4$, $K = 2$, so $r = 2$. Starting from $\beta = 0$:

**Token biases.** $Q_2$ of each row is its third-largest logit:

- $t_1$: sorted $(2.0, 0.5, -1.0, -2.0)$, third $= -1.0$, so $\alpha_1 = 1.0$.
- $t_2$: sorted $(3.0, 2.0, 0.5, -1.0)$, third $= 0.5$, so $\alpha_2 = -0.5$.
- $t_3$: sorted $(2.0, 0.0, -0.5, -1.0)$, third $= -0.5$, so $\alpha_3 = 0.5$.
- $t_4$: sorted $(2.0, 0.0, -1.0, -1.5)$, third $= -1.0$, so $\alpha_4 = 1.0$.

**Expert biases.** Add $\alpha_t$ down each column, then take the third largest:

- $e_1$: $(3.0, 1.5, 0.5, 3.0)$, sorted $(3.0, 3.0, 1.5, 0.5)$, so $\beta_1 = -1.5$.
- $e_2$: $(1.5, 2.5, 2.5, 1.0)$, sorted $(2.5, 2.5, 1.5, 1.0)$, so $\beta_2 = -1.5$.
- $e_3$: $(-1.0, 0.0, 0.0, -0.5)$, sorted $(0.0, 0.0, -0.5, -1.0)$, so $\beta_3 = 0.5$.
- $e_4$: $(0.0, -1.5, -0.5, 0.0)$, sorted $(0.0, 0.0, -0.5, -1.5)$, so $\beta_4 = 0.5$.

Check: each column of $Z + \alpha + \beta$ now has exactly two positive entries. For $e_1$ the column becomes $(1.5, 0.0, -1.0, 1.5)$, with two positives.

**Centre.** The mean of $(-1.5, -1.5, 0.5, 0.5)$ is $-0.5$, so $\beta = (-1, -1, 1, 1)$.

**Route with $B = Z + \beta$:**

| | $e_1$ | $e_2$ | $e_3$ | $e_4$ | Top-2 |
|---|---|---|---|---|---|
| $t_1$ | 1.0 | −0.5 | −1.0 | 0.0 | $e_1, e_4$ |
| $t_2$ | 1.0 | 2.0 | 1.5 | 0.0 | $e_2, e_3$ |
| $t_3$ | −1.0 | 1.0 | 0.5 | 0.0 | $e_2, e_3$ |
| $t_4$ | 1.0 | −1.0 | −0.5 | 0.0 | $e_1, e_4$ |

The loads are now $(2, 2, 2, 2)$, and MaxVio drops from 1.0 to 0.

The mixture weights still use the unbiased scores. Token $t_1$ goes to $e_1$ with weight $\sigma(2.0) = 0.881$ and to $e_4$ with weight $\sigma(-1.0) = 0.269$. The two weights sum to $1.150$, not 1, because nothing renormalises them. The bias moved $t_1$ to $e_4$, but the model still sees that the router itself thinks little of $e_4$ for this token.

### 7.3 Why "exact": the quantile of a distributed batch

In real training, the global batch is split across data-parallel ranks and gradient-accumulation microbatches. The token bias needs only the token's own row, so it is local. The expert bias needs a quantile of a *column* across every token in the global batch.

Suppose $t_1, t_2$ live on rank A and $t_3, t_4$ on rank B. Column $e_1 + \alpha$ is $(3.0, 1.5)$ on A and $(0.5, 3.0)$ on B. One published approach averages per-rank quantiles. Each rank has 2 tokens and a local share $r = 1$, so each takes its second largest: $1.5$ on A and $0.5$ on B. The average is $1.0$. The true global quantile is $Q_2(3.0, 1.5, 0.5, 3.0) = 1.5$, so averaging gives $\beta_1 = -1.0$ instead of $-1.5$. **The average of quantiles is not the quantile of the union.** Another approach sums 1000-bin histograms across ranks, which represents the union but is only accurate to the bin width.

EQB computes the global quantile exactly with **two-pass radix selection**. Every bfloat16 value is encoded as an order-preserving 16-bit integer key. In pass one, each rank builds a 256-bin histogram of the **high byte** of its keys, and the histograms are summed with one all-reduce. Scanning bins from the top shows which bin contains the target rank. In pass two, the ranks histogram the **low byte** of only the keys inside that bin, all-reduce again, and read off the exact value.

**A two-digit analogue.** Scale our column by 10 to get keys $30, 15, 5, 30$, and treat the tens digit as the high byte. Pass one counts tens digits: bin 3 holds 2 keys, bin 1 holds 1, bin 0 holds 1. We want the 3rd largest. Bin 3 covers ranks 1–2 and bin 1 covers rank 3, so the answer lies in bin 1. Pass two looks at the units digits inside bin 1, which is just $\{5\}$, giving key $15$, or $1.5$. That is exact, with no bin-width error.

The cost does not depend on $T$: two all-reduces of $256E$ int32 counts per layer per step. For $E = 384$ that is $256 \times 384 \times 4 = 393{,}216$ bytes per all-reduce. EQB has no balancing hyperparameter at all.

---

## 8. Load-Error Injection (LEI): Balance Inside Each Microbatch

One global $\beta$ cannot balance every microbatch individually. The usual fix is a GShard-style auxiliary loss, but that loss was derived for softmax probabilities that sum to one, and Kolibri's sigmoid scores do not. LEI instead writes each expert's load error directly into the gradient of the scores. For a microbatch $B_l$:

$$
f_e = \frac{c_e(B_l)}{K|B_l|/E}, \qquad \rho_e = f_e - 1, \qquad G_{t,e} \leftarrow G_{t,e} + \lambda\,\frac{\tanh\xi}{\xi}\,\rho_e, \qquad \xi = \frac{\|\rho\|_\infty}{\tau},
$$

where $G_{t,e}$ is the incoming gradient with respect to $S_{t,e}$. The scaling factor is defined as 1 at $\xi = 0$ by continuity. Kolibri uses $\lambda = 10^{-5}$ and $\tau = 1$. The report's companion paper derives this update as the **straight-through estimator** for unnormalised sigmoid scores. The GShard loss is the corresponding estimator for normalised softmax probabilities.

**Numerical check.** Treat our four tokens as one microbatch, before EQB has acted. The loads are $c = (4, 4, 0, 0)$ against a target of $2$, so

$$
f = (2, 2, 0, 0), \qquad \rho = (1, 1, -1, -1), \qquad \xi = \frac{1}{1} = 1, \qquad \frac{\tanh 1}{1} = 0.7616.
$$

Every token's score gradient receives $\lambda \times 0.7616 \times (1, 1, -1, -1)$. Gradient descent subtracts the gradient, so the scores of the overloaded $e_1, e_2$ are pushed *down* and those of the idle $e_3, e_4$ are pushed *up*, for every token in the microbatch.

The push reaches the router logits through the **chain rule**, $\partial S/\partial Z = \sigma(Z)(1 - \sigma(Z))$. For $t_1$ and $e_1$, $\sigma(2.0)(1 - \sigma(2.0)) = 0.105$, so the logit receives $10^{-5}\times 0.7616 \times 0.105$.

**Why $\tanh\xi/\xi$: a bounded injection.** Each entry obeys $|\rho_e| \le \|\rho\|_\infty = \xi\tau$, so

$$
\left|\lambda\,\frac{\tanh\xi}{\xi}\,\rho_e\right| \le \lambda\,\frac{\tanh\xi}{\xi}\,\xi\tau = \lambda\,\tau\tanh\xi < \lambda\tau,
$$

since $\tanh \xi < 1$. However lopsided a microbatch is, the injection never exceeds $\lambda\tau$. The report found this bound helps training stability. When imbalance is small, $\tanh\xi/\xi \approx 1$ and the injection is simply $\lambda\rho_e$, proportional to the error.

The two mechanisms split the work. EQB holds global balance with no tunable knob. LEI's single coefficient $\lambda$ then governs local balance and throughput, which gives fewer and less sensitive hyperparameters than Origin's mix of bias updates and an auxiliary loss. Pre-training throughput stayed flat at about 16,500 tokens/s/GPU across the run, with no expert-parallel degradation.

---

## 9. When the Bias Wins: The $1 - K/E$ Signature

Balance metrics can look perfect while the router has been silently overruled. Kolibri drops Origin's two leading dense blocks. An ablation at 327.6B tokens favoured all-MoE (loss 1.847 against 1.850). The full run then revealed a problem. To see it, compare the router's own choice $I^u_t = \text{Top-}K(Z_{t,:})$ with the routed choice $I_t$:

$$
\text{intervention rate } I(B) = \frac{1}{|B|}\sum_{t\in B}\left(1 - \frac{|I^u_t \cap I_t|}{K}\right).
$$

**In the running example.** Token $t_1$'s own top-2 is $\{e_1, e_2\}$ and it was routed to $\{e_1, e_4\}$, an overlap of 1, so $1 - 1/2 = 0.5$. Every token has overlap 1, so $I = 0.5$.

**What a fully overruled router looks like.** Suppose the bias dominates so completely that the routed set is a uniformly random $K$-subset, unrelated to the router's preference. Each of the router's $K$ preferred experts then lands in the routed set with probability $K/E$. By **linearity of expectation**, the expected overlap is $K \cdot K/E$, so

$$
\boxed{\mathbb{E}[I] = 1 - \frac{K^2/E}{K} = 1 - \frac{K}{E}.}
$$

In our toy, $1 - 2/4 = 0.5$, the same value we computed. With only 4 experts and $K = 2$, one EQB step is indistinguishable from random routing by this metric alone. For Kolibri, $1 - 6/384 = 0.984$.

**What happened.** In Kolibri's first two MoE layers, the intervention rate climbed to **98.5%** by the end of pre-training, which is the random-routing value. Their intrinsic top-$K$ mass was the highest of all layers: the router had strong preferences. But the mass on the actually selected experts fell to near $K/E$. To confirm, one layer at a time was perturbed at step 225,000, either replacing routed experts with random ones or silencing them entirely while keeping the shared expert. Only for layers 0 and 1 did the loss change by nothing measurable. Their routed experts are effectively unused. An attempt to densify these layers during SFT gave no clear gain, and fixing them is left to future work. A high intervention rate alone is not damning, though: layer 48 also has one, yet perturbing it clearly raises the loss.

---

## 10. Optimisation and Hyperparameter Transfer

Kolibri trains with **Warmup-Stable-Merge**. The learning rate warms up linearly over the first 100B tokens and then stays constant through all three stages. The base model is the average of the last 20 long-context checkpoints, taken 10B tokens apart. Attention and expert weights use **Muon** in the *spectral* convention, scaling each orthogonalised update by $\sqrt{d_{\text{out}}/d_{\text{in}}}$, which makes its learning rate width-independent. Embeddings and norm scales use Adam, and the LM head and router use AdamW with $\epsilon = 10^{-15}$. The attention output and expert down-projections start at zero, so every block starts as the identity.

**Width transfer** uses $\mu$P on 50-layer proxies of width 1024 and 2048. Their optimal learning rates differed by one $\sqrt{2}$ grid step, and losses within one step of the optimum differed by less than 0.1%.

**Horizon transfer** uses loss extrapolation with a power law in the **cumulative learning rate**:

$$
\mathcal{L}(D) = E + A\,(D - W/2)^{-\alpha}.
$$

**Deriving $D - W/2$.** During warmup over $W$ tokens, the learning rate rises linearly from $0$ to $\eta$, so its integral over warmup is the area of a triangle, $\tfrac12 \eta W$. After warmup it stays at $\eta$ for $D - W$ tokens. The total is

$$
\int_0^D \eta(s)\,ds = \tfrac12\eta W + \eta(D - W) = \eta\left(D - \tfrac{W}{2}\right).
$$

So the cumulative learning rate is proportional to $D - W/2$. With $W = 100$B and $D = 20$T, the coordinate is $19.95$T.

Sweeping Muon learning rates from $5\times10^{-4}$ to $8\times10^{-3}$ and two batch sizes on a half-width proxy for 500B tokens, the observed optimum sat at the largest learning rate. The fitted laws extrapolated to 20T moved it to $10^{-3}$ with batch 4,608 sequences of 16k tokens: $4608 \times 16{,}384 = 75{,}497{,}472 \approx 75.5$M tokens per step. Weight decay $2^{-12}$ beat $2^{-13}$ and $2^{-14}$ at every forecast horizon.

---

## 11. Data and Stages, Briefly

**Pre-training (20T at 16k).** The pool holds 78 datasets and 29.3T tokens. Aleph Alpha's own Common Crawl pipeline extracts over 308B documents. Exact deduplication across snapshots leaves 21.16B; fuzzy MinHash deduplication removes a further 25.9%; substring deduplication removes 21.3% of the remaining bytes. German makes up 21.3% of training tokens. About 0.8T of it is organic web text, and about 1.1T comes from rephrasing German documents, which keeps German subject matter and register in a way translation would not. English quality scores blend five classifier heads on the probability simplex. The source mix is fit by a log-linear law over 3,354 proxy runs.

**Mid-training (3.44T at 64k).** Mid-training shifts the mix towards English instruction and reasoning, STEM QA and code, which together hold 73% of the budget. The pool is decontaminated against all 226 evaluation tasks. The switch from the pre-training mix is a linear blend over the first $H = 100$B tokens. If the pre-training share decays as $w(t) = 1 - t/H$, the cumulative pre-training tokens by position $t$ are

$$
\int_0^t\left(1 - \frac{s}{H}\right)ds = t - \frac{t^2}{2H}.
$$

To place a pre-training bulk whose token midpoint is $m_i$, solve $t - t^2/(2H) = m_i$. This is $t^2 - 2Ht + 2Hm_i = 0$, and the **quadratic formula**, taking the root inside $[0, H]$, gives

$$
t_i = H\left(1 - \sqrt{1 - \frac{2m_i}{H}}\right).
$$

At $t = H$, the total is $H - H/2 = H/2 = 50$B pre-training tokens in the window, as the report states.

**Long-context extension (200B at 256k).** One third of the data comes from naturally long documents, one third ($s = 1/3$) from the mid-training pool reweighted towards long documents, and the rest from the natural mid-training mix. The reweighting gives length band $b$ (0 for up to 8k tokens, up to 5 for 128k–256k) the weight $w(b) = 1/(1 + e^{-(b - 4)})$. That is $0.5$ for the 64k–128k band and $1/(1 + e^{-1}) = 0.731$ for the longest. Checkpoint merging recovered the small loss of short-context ability that long-context training caused.

---

## 12. Results

Pre-training benchmark averages, Overall English / German:

| Model | Active | EN | DE |
|---|---|---|---|
| **Kolibri Base** | 3.46B | **81.1** | **81.5** |
| Kolibri Origin Base | 3.27B | 58.4 | 61.1 |
| Nemotron 3 Nano Base | 3B | 77.5 | 76.0 |
| Qwen3.5 35B-A3B Base | 3B | 73.8 | 76.6 |
| Gemma 4 26B-A4B Base | 4B | 58.1 | 61.1 |
| GLM-4.5 Air Base | 12B | 77.1 | 79.4 |
| Nemotron 3 Super Base | 12B | 83.1 | 85.0 |
| OLMo 3 32B | 32B | 67.9 | 65.2 |

Kolibri Base leads every model up to 5B active parameters and is second only to Nemotron 3 Super, which activates more than three times as many parameters. It is first on the English math average (84.9). Code is its relative weak spot against the 12B-active models.

The report flags one caveat itself. HumanEval completions during pre-training recite the reference solution 22% to 95% of the time, and pass@1 tracks the recited share with Pearson $r = 0.90$. The pre-training pool is not decontaminated, so the HumanEval numbers are inflated.

On "I don't know" variants of seven multiple-choice tasks, Kolibri Base has the second-best distributional correctness score. It moves more probability onto abstention or the right answer than any similar-sized model.

---

## Summary

UniBPE ranks merges by the change in Unigram loss, $\Delta\mathcal{L}$, which to first order is $-c_{ab}(\text{PMI}-1)$. It therefore prefers associated units like *-ung* over merely frequent pairs like *-en*, and gives German its best compression and morphology among the tokenisers tested. Ten NoPE global blocks and forty 512-token RoPE windows cut the KV cache to about 20% of full attention, $1024(10L + 40\cdot512)$ numbers per request, and let the model run past 256k without rescaling. In the sparse MoE behind them, Exact Quantile Balancing finds the exact global quantile of each expert's column, repairing our collapsed $(4,4,0,0)$ router to $(2,2,2,2)$ in one step. Load-Error Injection adds a gradient bounded by $\lambda\tau$ to balance each microbatch. An intervention rate near $1 - K/E$ exposed Kolibri's first two layers as routing effectively at random.

---

*Next: [Kolibri Post-Training from Scratch](/blog/kolibri-post-training-effort-labels-format-rewards-gradient-bound)*
