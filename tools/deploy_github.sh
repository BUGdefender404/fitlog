#!/usr/bin/env bash
# 推送 main + 部署 gh-pages + 设置仓库描述/topics（网络不稳时每 60s 自动重试，最多 15 次/步）
set -u
cd "$(dirname "$0")/.."
REPO="https://github.com/BUGdefender404/qingshiji.git"

push_retry() { # $1=分支 $2=可选 -f
  for i in $(seq 1 15); do
    if [ "${2:-}" = "-f" ]; then git push -f origin "$1" && return 0; else git push origin "$1" && return 0; fi
    echo "[retry] $1 第 $i/15 次失败，60s 后重试..."
    sleep 60
  done
  echo "[FAIL] $1 推送最终失败"; return 1
}

echo "== 1/3 推送 main =="
push_retry main

echo "== 2/3 部署 gh-pages =="
rm -rf dist/.git
(
  cd dist &&
  git init -q -b gh-pages &&
  git remote add origin "$REPO" &&
  git add -A &&
  git commit -q -m "deploy v1.3" &&
  push_retry gh-pages -f
)
rm -rf dist/.git

echo "== 3/3 仓库描述与 topics =="
gh repo edit BUGdefender404/qingshiji \
  --description "轻食记 Qingshiji — 自托管减脂饮食记录 App：拍照 AI 识别 · 扫码查营养 · 口令多用户 · PWA / 安卓 APK" \
  --add-topic diet --add-topic health --add-topic fitness --add-topic food-diary \
  --add-topic pwa --add-topic android --add-topic react --add-topic typescript \
  --add-topic hono --add-topic sqlite 2>&1 | head -2

echo "== 全部完成 =="
