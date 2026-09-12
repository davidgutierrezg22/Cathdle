from pathlib import Path
import ast

root = Path(__file__).resolve().parents[1]
ast.parse((root / "server" / "app.py").read_text(encoding="utf-8"))
print("OK: server/app.py syntax")
