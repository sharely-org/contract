#!/bin/bash

set -euo pipefail

echo "使用 Rust 1.79.0 与 Anchor CLI 进行构建..."

export RUSTUP_TOOLCHAIN=1.79.0

# 确保 Anchor 使用项目 Anchor.toml 的工具链
anchor --version

echo "开始 anchor build..."
anchor build | cat

echo "构建完成："
ls -lh target/deploy | cat

echo "IDL 输出位置：target/idl/sharely_contract.json"
