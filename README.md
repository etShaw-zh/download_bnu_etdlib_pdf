# BNU ETD PDF Loader

<img src="https://img.shields.io/github/license/etShaw-zh/download_bnu_etdlib_pdf?color=2E75B6"  alt="License">
<img src="https://img.shields.io/github/downloads/etShaw-zh/download_bnu_etdlib_pdf/total?logo=github&color=2E75B6" alt='download' />

#### 简介
一个使用纯原生 JavaScript 编写的 Chrome 插件，用于在北京师范大学学位论文阅读器（`etdlib.bnu.edu.cn`）上自动滚动、触发所有懒加载页面，并将整本论文无损导出为 PDF。

<video src="bnu-etd-extension.webm" controls width="640" muted>
  您的浏览器不支持内嵌视频，请直接下载 <a href="bnu-etd-extension.webm">bnu-etd-extension.webm</a> 观看演示。
</video>

#### 下载方式

- **Release 包（推荐）**：前往 [GitHub Releases](https://github.com/etShaw-zh/download_bnu_etdlib_pdf/releases) 下载最新的 `bnu-etd-extension.zip`，解压即可得到可直接加载的 `bnu-etd-extension/` 目录。
- **源码方式**：克隆本仓库并使用 `bnu-etd-extension/` 目录进行开发或调试。

#### 使用步骤

1. 打开 Chrome，访问 `chrome://extensions` 并开启 “开发者模式”。
2. 点击 “加载已解压的扩展程序”，选择 Release 解压得到的 `bnu-etd-extension/`（或源码中的 `bnu-etd-extension/`）目录。
3. 打开学位论文阅读页，点击浏览器工具栏上的插件图标，再点击 “开始加载并导出”。弹窗会实时显示加载进度，全部完成后会自动弹出浏览器保存对话框。

> 导出流程依赖前台标签页的滚动，请保持目标标签页处于激活状态，直到 Chrome 弹出保存窗口；过程中不要手动滚动页面或切换其他标签。

#### 版权提示与免责声明

- 本仓库及插件仅供个人学习与科研参考，严禁对外传播、分享或商业使用。
- 被导出的论文内容归北京师范大学及原作者所有，请在尊重版权的前提下使用。
- 建议在阅读完成后立即删除导出的 PDF，若因违规使用造成法律风险，责任由使用者自行承担。
