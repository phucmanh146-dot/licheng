"""本地与部署统一入口。

    python run.py                       # 默认 127.0.0.1:8787，仅本机可访问
    LICHENG_HOST=0.0.0.0 python run.py  # 容器/服务器部署，允许外部访问
    PORT=8080 python run.py             # 兼容 Railway / Render 等平台的 PORT

也可直接 ``python -m app.server``，两种入口读取同一组环境变量。
"""
import os

from app.server import run


def main() -> None:
    host = os.getenv("LICHENG_HOST", "127.0.0.1")
    # 云平台通常只注入 PORT；本地优先用 LICHENG_PORT。
    port = int(os.getenv("LICHENG_PORT") or os.getenv("PORT") or "8787")
    run(host=host, port=port)


if __name__ == "__main__":
    main()
