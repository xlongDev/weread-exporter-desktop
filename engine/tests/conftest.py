"""pytest 共享 fixture：保证引擎模块可导入、输出写入临时目录。"""
import os
import sys

ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(ENGINE_DIR)
if ENGINE_DIR not in sys.path:
    sys.path.insert(0, ENGINE_DIR)
