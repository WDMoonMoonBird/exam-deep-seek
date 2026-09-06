"""trustjudge_core.py - TrustJudge distribution-sensitive single-answer grading core.

A faithful Python port of the algorithm pieces of the TrustJudge framework
(ICLR 2026, "TrustJudge: Inconsistencies of LLM-as-a-Judge and How to Alleviate
Them", arXiv:2509.21117). The functions here mirror, function by function, the
reference implementation cloned at /tmp/trustjudge:

  * extract_middle_dict           <- trustjudge/common.py
  * compute_softmax_weighted_score <- ConflictCalculator.compute_softmax_weighted_score
                                     (static method, trustjudge/ConflictCalculator.py)

Semantics preserved from the original
-------------------------------------
1. Input to extract_middle_dict is the *per-token probability* view of an LLM
   completion: a list where position i maps token -> probability
   (probability = exp(logprob) over the top_logprobs of that position, exactly how
   the original OpenaiGenerator._calculate_probs_and_logprobs builds its output_probs).
2. Keys are cleaned the same way as the original clear_key helper: token-encoding
   space markers (U+0120 "Ġ", U+2581, plus the literal escape forms \u0120/\u2581)
   and surrounding whitespace are removed, and duplicate cleaned keys at one
   position are merged by summing probabilities (original defaultdict accumulation).
3. The score is located by scanning for a [ ... ] square-bracket pair whose
   content looks like a numeric grade token (the prompt contract is that the
   judge ends its reply with "Score: [X]"). The search window behind a "[" is
   bounded exactly like the original (search_limit = min(left_index + 6, len)).
4. When allowed_first_keys is given, the located content must contain an allowed
   score value, otherwise the pair is rejected and the scan continues (the
   original raises ValueError("No valid square bracket pairs ...") when nothing
   qualifies).
5. compute_softmax_weighted_score is a line-for-line port of the original static
   method: p -> logit (log-odds with an eps floor), divide by temperature T,
   softmax over the *visible* candidates, then expectation sum(score * weight).
   Candidates with p<=0 or p>=1 are skipped and non-numeric keys are dropped,
   exactly as in the reference.

Deliberate, documented deviations (this service grades 0..maxScore integer rubrics
through DeepSeek, whose tokenizer can split multi-digit scores into several tokens)
----------------------------------------------------------------------------------------
a) Multi-token integer scores (1-3 digits). The original only accepts a bracket
   pair whose middle is exactly ONE token position, so a score such as
   "Score: [85]" tokenised as [ 8 5 ] would be rejected. Here, after the strict
   single-token path fails, the columns between [ and ] are assembled into integer
   candidates: every cleaned key that is all digits is a candidate digit-string of
   its column, all cross-column concatenations are formed (bounded to integers of
   <=3 digits), a candidate probability is the product of its per-column
   probabilities (an approximation of the joint mass - the API only exposes the
   per-position marginal top_logprobs conditioned on the sampled prefix), and equal
   integers are re-merged. Whitespace-only columns (e.g. a pure space token) carry
   no digit and are skipped.
b) Single-token numbers carrying a leading space are handled implicitly: "Ġ85"
   cleans to "85", so it is already a normal single-token case.
c) The strict single-token path checks membership using the first (most probable)
   key the same way the original does; but when that first key is only whitespace
   (a token like "Ġ"), the original would reject a perfectly good numeric column.
   This port falls back to assembly instead of giving up, so such outputs still
   grade. Any remaining failure raises the original ValueError.

The functions are pure and stdlib-only so they can be unit-tested in isolation.
"""

from __future__ import annotations

import itertools
import math
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

__all__ = ["extract_middle_dict", "compute_softmax_weighted_score", "MAX_DIGITS"]


# --------------------------------------------------------------------------
# helpers shared with / mirrored from the reference
# --------------------------------------------------------------------------


def _clear_key(key: Any) -> Any:
    """Mirror of the reference clear_key: drop token-space markers + surrounding whitespace.

    e.g. "Ġ85" -> "85", "Ġ" -> "" (empty string when the token was only a space).
    """
    if isinstance(key, str):
        # remove every occurrence of the space marker characters, then strip.
        # Note: \u0120 is the "Ġ" character and \u2581 is the "▁" character.
        return key.replace("\u0120", "").replace("Ġ", "").replace("\u2581", "").strip()
    return key


def _cleaned_prob_rows(logprobs: List[Dict[Any, float]]) -> List[Dict[Any, float]]:
    """Clean every key of every per-position dict and merge duplicate keys.

    Mirrors the processed_logprobs construction in the original extract_middle_dict
    (clear_key + defaultdict(float) accumulation).
    """
    processed: List[Dict[Any, float]] = []
    for entry in logprobs:
        acc: Dict[Any, float] = defaultdict(float)
        for k, v in entry.items():
            acc[_clear_key(k)] += float(v)
        processed.append(dict(acc))
    return processed


def _allowed_float_set(allowed: Optional[Iterable[Any]]) -> Optional[set]:
    """Convert allowed_first_keys into a set of floats (as the reference does)."""
    if allowed is None:
        return None
    return {float(x) for x in allowed}


def _key_in_allowed(key: Any, allowed_floats: Optional[set]) -> bool:
    """Membership test used by the reference for the middle key."""
    if allowed_floats is None:
        return True
    try:
        num = float(key)
    except (TypeError, ValueError):
        return False
    return num in allowed_floats


MAX_DIGITS = 3  # supports 1..3-digit integer scores (0..999)


# --------------------------------------------------------------------------
# extract_middle_dict  (port of trustjudge/common.py::extract_middle_dict)
# --------------------------------------------------------------------------


def extract_middle_dict(
    logprobs: List[Dict[Any, float]],
    allowed_first_keys: Optional[Iterable[Any]] = None,
) -> Dict[Any, float]:
    """From a per-token probability sequence locate the score content between "[" and "]".

    Parameters mirror the reference:
      logprobs             : list of per-output-position dicts {token: probability}.
      allowed_first_keys   : optional iterable of acceptable score values; when given,
                             bracket content must contain one of them.

    Returns a dict mapping score token/string -> probability for the visible
    candidates of the located score position(s). Raises ValueError (same message
    family as the original) when no valid pair is found.
    """
    rows = _cleaned_prob_rows(logprobs)
    allowed_floats = _allowed_float_set(allowed_first_keys)

    for left_index, d in enumerate(rows):
        if not d:
            continue
        # original: bracket must be the most probable token of its position
        if next(iter(d)) != "[":
            continue
        search_limit = min(left_index + 6, len(rows))
        # find the first later position whose *candidates* include "]"
        # (the reference checks any key == "]", not only the top-1)
        close_index: Optional[int] = None
        for right_index in range(left_index + 1, search_limit):
            if any(isinstance(k, str) and k.strip() == "]" for k in rows[right_index].keys()):
                close_index = right_index
                break
        if close_index is None:
            continue

        middle = rows[left_index + 1:close_index]
        if not middle:
            continue

        # --- 1) strict single-token path (exact original semantics) ---
        if len(middle) == 1 and middle[0]:
            cand = middle[0]
            first_key = next(iter(cand))
            if _key_in_allowed(first_key, allowed_floats):
                return cand
        # NOTE: the original would continue scanning for the next "[" here; this
        # port instead tries the multi-token assembly below (documented deviation a).

        # --- 2) multi-token / multi-digit assembly path ---
        assembled = _assemble_numeric_scores(middle, allowed_floats)
        if assembled is not None:
            return assembled

    raise ValueError(
        "No valid square bracket pairs were found or the middle dictionary "
        "does not meet the requirements."
    )


def _assemble_numeric_scores(
    columns: List[Dict[Any, float]],
    allowed_floats: Optional[set],
) -> Optional[Dict[int, float]]:
    """Best-effort assembly of an integer score split across token columns.

    columns        : the per-position cleaned prob dicts strictly between "[" and "]".
    allowed_floats : allowed score values as floats, or None.

    Returns {integer_score: probability} aggregated over all digit concatenations
    (probability = product over the columns used, summed when two tokenisations
    yield the same integer), or None when nothing numeric can be assembled.
    Only integers with 1..MAX_DIGITS digits inside the allowed set survive.
    """
    per_column: List[List[Tuple[str, float]]] = []
    for col in columns:
        digits: List[Tuple[str, float]] = []
        for key, prob in col.items():
            if not isinstance(key, str) or not key.isdigit():
                continue
            if len(key) > MAX_DIGITS:
                continue
            if not (0.0 < prob < 1.0):
                continue
            digits.append((key, prob))
        if digits:
            per_column.append(digits)
        # whitespace-only columns carry no digit -> skipped (deviation a)
    if not per_column:
        return None

    aggregated: Dict[int, float] = defaultdict(float)
    for combo in itertools.product(*per_column):
        number_str = "".join(part for part, _ in combo)
        if len(number_str) > MAX_DIGITS:
            continue
        try:
            value = int(number_str)
        except ValueError:
            continue
        if allowed_floats is not None and float(value) not in allowed_floats:
            continue
        prob = 1.0
        for _, p in combo:
            prob *= p
        aggregated[value] += prob

    if not aggregated:
        return None
    return dict(sorted(aggregated.items(), key=lambda kv: (-kv[1], kv[0])))


# --------------------------------------------------------------------------
# compute_softmax_weighted_score
# (port of ConflictCalculator.compute_softmax_weighted_score, static method)
# --------------------------------------------------------------------------


def compute_softmax_weighted_score(
    score_dict: Dict[Any, float],
    allowed_scores: Optional[Iterable[Any]] = None,
    T: float = 0.2,
    eps: float = 1e-8,
) -> float:
    """Convert probabilities to logits, apply a temperature softmax, weight scores.

    Line-for-line port of the TrustJudge reference:

        logits     = log((p + eps) / (1 - p + eps))
        exp_logits = exp(logit / T)
        weights    = exp_logits / sum(exp_logits)
        result     = sum(score * weight)

    * Candidates whose probability is <=0 or >=1 are skipped (as in the original),
      protecting the logit transform from +-inf.
    * Keys that are not numeric, and scores outside allowed_scores (when given), are
      dropped - mirroring the reference call sites that pass set(range(1, scale+1)).
    * Returns 0.0 when no valid candidate remains (original behaviour).
    """
    if allowed_scores is not None:
        try:
            allowed_set = {float(x) for x in allowed_scores}
        except Exception as exc:  # mirrored from reference
            raise ValueError(
                "The elements in allowed_scores must be convertible to the float type"
            ) from exc
    else:
        allowed_set = None

    valid_items: List[Tuple[float, float]] = []
    for k, p in score_dict.items():
        try:
            score = float(str(k).strip())
        except Exception:
            continue
        if allowed_set is not None and score not in allowed_set:
            continue
        if p <= 0 or p >= 1:
            continue
        valid_items.append((score, float(p)))

    if not valid_items:
        return 0.0

    logits = [math.log((p + eps) / (1 - p + eps)) for _, p in valid_items]
    exp_logits = [math.exp(l / T) for l in logits]
    sum_exp = sum(exp_logits)
    weights = [x / sum_exp for x in exp_logits]
    weighted_sum = sum(score * w for (score, _), w in zip(valid_items, weights))
    return float(weighted_sum)