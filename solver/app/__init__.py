"""產線排程服務。"""
import sys
import types

# OR-Tools 的 cp_model 在匯入時會順便載入 pandas（只用在我們沒用到的表格輔助功能）。
# 有些 Windows 電腦的「應用程式控制」會擋 pandas 的 DLL，這時換成一個空殼讓 OR-Tools 能正常載入；
# 伺服器（Linux Docker）上 pandas 正常，這段不會生效。
try:
    import pandas  # noqa: F401
except ImportError:
    for k in [k for k in sys.modules if k == "pandas" or k.startswith("pandas.")]:
        del sys.modules[k]
    _stub = types.ModuleType("pandas")

    class _Unavailable:
        pass

    _stub.__getattr__ = lambda name: _Unavailable  # type: ignore[attr-defined]
    sys.modules["pandas"] = _stub
