import pytest

from sites.services.normalization import normalize_text


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("  200 W. Washington St. ", "200 w washington st"),
        ("１２ Main\u00a0Street", "12 main street"),
        ("12-14 Main", "12 14 main"),
        ("O'Neill", "o neill"),
        ("Straße", "strasse"),
    ],
)
def test_normalize_text_produces_the_canonical_identity(
    value: str, expected: str
) -> None:
    assert normalize_text(value) == expected


def test_normalize_text_does_not_expand_abbreviations() -> None:
    assert normalize_text("10 Main St") != normalize_text("10 Main Street")


def test_normalize_text_keeps_unit_tokens_significant() -> None:
    assert normalize_text("10 Main St, Unit A") != normalize_text("10 Main St, Unit B")


@pytest.mark.parametrize("value", ["", "   ", "...", "---", "'\u00a0'"])
def test_normalize_text_can_reveal_structurally_empty_input(value: str) -> None:
    assert normalize_text(value) == ""
