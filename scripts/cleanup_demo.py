#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""List, then with --yes delete, every [DEMO] item in the project: tasks, stories, features, then the chain."""
import sys

from rally_demo import PREFIX, TAG, assert_demo, call, query, short

ORDER = ["task", "hierarchicalrequirement", "defect", "portfolioitem/feature",
         "portfolioitem/capability", "portfolioitem/outcome", "portfolioitem/program"]


def main() -> int:
    yes = "--yes" in sys.argv
    total = 0
    for type_path in ORDER:
        rows = query(type_path, f'((Name contains "{PREFIX.strip()}") AND (Tags.Name = "{TAG}"))',
                     fetch="ObjectID,FormattedID,Name,Project")
        for r in rows:
            if not r["Name"].startswith(PREFIX):
                continue
            assert_demo(r["Name"], short(r["Project"]["_ref"]))
            total += 1
            if yes:
                call("DELETE", f"/{type_path}/{r['ObjectID']}")
                print(f"deleted      {r['FormattedID']} {r['Name']}")
            else:
                print(f"would delete {r['FormattedID']} {r['Name']}")
    suffix = "" if yes else " (dry run; pass --yes to delete)"
    print(f"{total} item(s){suffix}. The workspace tag {TAG!r} is left in place.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
