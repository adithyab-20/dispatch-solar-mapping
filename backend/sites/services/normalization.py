import unicodedata


def normalize_text(value: str) -> str:
    """Return the canonical identity key for a site display value."""
    compatible_value = unicodedata.normalize("NFKC", value)
    without_punctuation = "".join(
        " " if unicodedata.category(character).startswith("P") else character
        for character in compatible_value
    )
    return " ".join(without_punctuation.split()).casefold()
