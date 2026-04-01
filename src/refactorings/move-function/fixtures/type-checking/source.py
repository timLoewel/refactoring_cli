from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence


def summarize(items: Sequence[str]) -> str:
    return ", ".join(items)
