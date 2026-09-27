"""Build an evidence capsule for one tracked candidate (A2 demo)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from backend.config import PIPELINE_VERSION  # noqa: E402
from backend.measurement import build_evidence  # noqa: E402


def main() -> None:
    cid = sys.argv[1] if len(sys.argv) > 1 else "3i-atlas"
    track = json.loads((ROOT / "data" / f"track_{cid}-tracked.json").read_text())
    verdicts = None
    pf = ROOT / "data" / f"pairfit_{cid}-tracked.json"
    if pf.is_file():
        pj = json.loads(pf.read_text())
        verdicts = {
            "tests": [
                {"family": t.get("family"), "dA_sigma": t.get("dA_sigma"),
                 "dR_sigma": t.get("dR_sigma"), "verdict": t.get("verdict")}
                for t in pj.get("tests", [])
            ],
            "joints": pj.get("joints"),
        }
    ev = build_evidence(cid, track, PIPELINE_VERSION, verdicts)
    dest = ROOT / "data" / f"evidence_{cid}.json"
    dest.write_text(json.dumps(ev, indent=1))
    bad = len(ev["validation_problems"])
    print(f"{cid}: {len(ev['measurements'])} measurements, {bad} problems -> {dest.name}")
    for p in ev["validation_problems"][:5]:
        print("  !", p)


if __name__ == "__main__":
    main()
