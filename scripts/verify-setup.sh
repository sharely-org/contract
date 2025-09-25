#!/bin/bash

# ===========================================
# Sharely Contract 环境验证脚本
# ===========================================

set -e

echo "🔍 开始验证 Sharely Contract 环境配置..."
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查函数
check_command() {
    local cmd=$1
    local version_cmd=$2
    local expected_version=$3
    local name=$4
    
    echo -n "检查 $name... "
    
    if command -v $cmd &> /dev/null; then
        if [ -n "$version_cmd" ]; then
            local version=$($version_cmd 2>/dev/null | head -n1)
            echo -e "${GREEN}✓${NC} $version"
        else
            echo -e "${GREEN}✓${NC} 已安装"
        fi
    else
        echo -e "${RED}✗${NC} 未安装"
        return 1
    fi
}

# 检查版本是否满足要求
check_version() {
    local cmd=$1
    local version_cmd=$2
    local min_version=$3
    local name=$4
    
    if command -v $cmd &> /dev/null; then
        local version=$($version_cmd 2>/dev/null | head -n1)
        echo -n "验证 $name 版本... "
        
        # 这里可以添加版本比较逻辑
        echo -e "${GREEN}✓${NC} $version"
    fi
}

echo ""
echo "📋 系统信息"
echo "=========================================="
echo "操作系统: $(uname -s)"
echo "架构: $(uname -m)"
echo "Shell: $SHELL"
echo ""

echo "🔧 必需软件检查"
echo "=========================================="

# 检查 Node.js
check_command "node" "node --version" "20.18.1+" "Node.js"
if [ $? -eq 0 ]; then
    NODE_VERSION=$(node --version | sed 's/v//')
    echo "  Node.js 版本: $NODE_VERSION"
fi

# 检查 Yarn
check_command "yarn" "yarn --version" "1.22+" "Yarn"
if [ $? -eq 0 ]; then
    YARN_VERSION=$(yarn --version)
    echo "  Yarn 版本: $YARN_VERSION"
fi

# 检查 Rust
check_command "rustc" "rustc --version" "1.81.0+" "Rust"
if [ $? -eq 0 ]; then
    RUST_VERSION=$(rustc --version | cut -d' ' -f2)
    echo "  Rust 版本: $RUST_VERSION"
fi

# 检查 Cargo
check_command "cargo" "cargo --version" "1.81.0+" "Cargo"
if [ $? -eq 0 ]; then
    CARGO_VERSION=$(cargo --version | cut -d' ' -f2)
    echo "  Cargo 版本: $CARGO_VERSION"
fi

# 检查 Solana CLI
check_command "solana" "solana --version" "2.1.10+" "Solana CLI"
if [ $? -eq 0 ]; then
    SOLANA_VERSION=$(solana --version | cut -d' ' -f2)
    echo "  Solana CLI 版本: $SOLANA_VERSION"
fi

# 检查 Anchor CLI
check_command "anchor" "anchor --version" "0.31.1+" "Anchor CLI"
if [ $? -eq 0 ]; then
    ANCHOR_VERSION=$(anchor --version | cut -d' ' -f2)
    echo "  Anchor CLI 版本: $ANCHOR_VERSION"
fi

echo ""
echo "📦 项目依赖检查"
echo "=========================================="

# 检查项目目录
if [ -f "package.json" ]; then
    echo -n "检查 package.json... "
    echo -e "${GREEN}✓${NC} 存在"
    
    # 检查 node_modules
    if [ -d "node_modules" ]; then
        echo -n "检查 node_modules... "
        echo -e "${GREEN}✓${NC} 已安装"
    else
        echo -n "检查 node_modules... "
        echo -e "${YELLOW}⚠${NC} 未安装，运行 'yarn install'"
    fi
else
    echo -n "检查 package.json... "
    echo -e "${RED}✗${NC} 不存在，请确保在项目根目录运行此脚本"
    exit 1
fi

# 检查 Cargo.toml
if [ -f "Cargo.toml" ]; then
    echo -n "检查 Cargo.toml... "
    echo -e "${GREEN}✓${NC} 存在"
else
    echo -n "检查 Cargo.toml... "
    echo -e "${RED}✗${NC} 不存在"
fi

# 检查 Anchor.toml
if [ -f "Anchor.toml" ]; then
    echo -n "检查 Anchor.toml... "
    echo -e "${GREEN}✓${NC} 存在"
else
    echo -n "检查 Anchor.toml... "
    echo -e "${RED}✗${NC} 不存在"
fi

echo ""
echo "🔨 构建测试"
echo "=========================================="

# 测试 Rust 构建
echo -n "测试 Rust 构建... "
if cargo check &> /dev/null; then
    echo -e "${GREEN}✓${NC} 成功"
else
    echo -e "${RED}✗${NC} 失败"
    echo "  运行 'cargo check' 查看详细错误"
fi

# 测试 Anchor 构建
echo -n "测试 Anchor 构建... "
if cargo clean && anchor build &> /dev/null; then
    echo -e "${GREEN}✓${NC} 成功"
else
    echo -e "${RED}✗${NC} 失败"
    echo "  运行 'anchor build' 查看详细错误"
fi

echo ""
echo "🌐 网络配置检查"
echo "=========================================="

# 检查 Solana 配置
if command -v solana &> /dev/null; then
    echo "Solana 配置:"
    solana config get
    echo ""
fi

# 检查 RPC 连接
if command -v solana &> /dev/null; then
    echo -n "测试 RPC 连接... "
    if solana cluster-version &> /dev/null; then
        echo -e "${GREEN}✓${NC} 连接成功"
    else
        echo -e "${RED}✗${NC} 连接失败"
        echo "  请检查 RPC_URL 配置"
    fi
fi

echo ""
echo "📁 目录结构检查"
echo "=========================================="

# 检查关键目录和文件
directories=("programs" "scripts" "tests" "target")
files=("package.json" "Cargo.toml" "Anchor.toml" "rust-toolchain.toml")

for dir in "${directories[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓${NC} $dir/"
    else
        echo -e "${RED}✗${NC} $dir/ (缺失)"
    fi
done

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file (缺失)"
    fi
done

echo ""
echo "🎯 总结"
echo "=========================================="

# 统计检查结果
total_checks=0
passed_checks=0

# 这里可以添加更详细的统计逻辑

echo -e "${BLUE}环境验证完成！${NC}"
echo ""
echo "如果发现问题，请参考以下解决方案："
echo "1. 安装缺失的软件"
echo "2. 运行 'yarn install' 安装依赖"
echo "3. 运行 'anchor build' 构建项目"
echo "4. 检查网络连接和 RPC 配置"
echo ""
echo "更多帮助请查看 README.md 文档"
