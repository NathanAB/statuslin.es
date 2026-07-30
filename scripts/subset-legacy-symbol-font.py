#!/usr/bin/env python3
"""Build the renamed terminal-symbol fallback from a pinned JuliaMono TTF."""

import argparse

from fontTools import subset
from fontTools.ttLib import TTFont


FAMILY = "StatuslineLegacySymbols"
FULL_NAME = "Statusline Legacy Symbols"
VERSION = "0.062-statuslines.1"
CHECKER_BOARD_FILL = 0x1FB95


def replace_name(font: TTFont, name_id: int, value: str) -> None:
    name_table = font["name"]
    name_table.names = [record for record in name_table.names if record.nameID != name_id]
    name_table.setName(value, name_id, 3, 1, 0x409)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    args = parser.parse_args()

    font = TTFont(args.source)
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 10, 11, 13, 14]
    options.name_legacy = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=[CHECKER_BOARD_FILL])
    subsetter.subset(font)

    replace_name(font, 1, FAMILY)
    replace_name(font, 2, "Regular")
    replace_name(font, 3, f"{FAMILY}-Regular-{VERSION}")
    replace_name(font, 4, FULL_NAME)
    replace_name(font, 5, f"Version {VERSION}")
    replace_name(font, 6, f"{FAMILY}-Regular")
    replace_name(
        font,
        10,
        "Modified one-glyph subset of JuliaMono v0.062 for statuslin.es; "
        "family renamed under the SIL Open Font License.",
    )

    font.save(args.output, reorderTables=True)


if __name__ == "__main__":
    main()
