# 砺程 · 质量进阶工作台 —— 生产容器
# 标准库 HTTP 服务 + SQLite，单进程即可运行；数据卷持久化 data/。
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LICHENG_HOST=0.0.0.0 \
    PORT=8787

WORKDIR /app

# 依赖单独一层，改动业务代码时不重复安装。
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 运行时数据（数据库、上传、检索记忆）落在这个目录，建议挂载为卷。
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + __import__('os').getenv('PORT','8787') + '/api/health', timeout=2)" || exit 1

CMD ["python", "run.py"]
