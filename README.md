# 🐦‍⬛小鸦PDF

![License](https://img.shields.io/github/license/etShaw-zh/download_bnu_etdlib_pdf?color=2E75B6) ![Downloads](https://img.shields.io/github/downloads/etShaw-zh/download_bnu_etdlib_pdf/total?logo=github&color=2E75B6)

#### 简介
一个使用纯原生 JavaScript 编写的浏览器插件，用于在北京师范大学学位论文阅读器（`etdlib.bnu.edu.cn`）上自动滚动、触发所有懒加载页面，并将整本论文无损导出为 PDF。

![演示动画](./bnu-etd-extension.gif)

#### 下载方式

- **Release 包（推荐）**：前往 [GitHub Releases](https://github.com/etShaw-zh/download_bnu_etdlib_pdf/releases) 下载最新的 `bnu-etd-extension.zip`，解压即可得到可直接加载的 `bnu-etd-extension/` 目录。
- **源码方式**：克隆本仓库并使用 `bnu-etd-extension/` 目录进行开发或调试。

#### 使用步骤

1. 打开 Chrome，访问 `chrome://extensions` （MS Edge，访问 `edge://extensions`） 并开启 “开发者模式”。
2. 点击 “加载已解压的扩展程序”，选择 Release 解压得到的 `bnu-etd-extension/`（或源码中的 `bnu-etd-extension/`）目录。
3. 打开论文详情页，点击浏览器工具栏上的插件图标，再点击 “开始加载并导出”。插件会读取论文标题和作者，点击“查看全文”进入阅读器后自动导出，默认文件名为 `标题_作者.pdf`。若浏览器拦截了新标签页，请手动点击页面的“查看全文”；仍需满足网站的登录和全文阅读权限。
4. 也可以先在详情页点击“查看全文”，再在阅读页启动插件；同样会沿用详情页的标题和作者。直接打开阅读器时，若没有详情页信息，则使用阅读器标题作为文件名。弹窗会显示加载进度，全部完成后会触发浏览器下载。

#### 版权提示与免责声明

- 本仓库及插件仅供个人学习与科研参考，严禁对外传播、分享或商业使用。
- 被导出的论文内容归北京师范大学及原作者所有，请在尊重版权的前提下使用。
- 建议在阅读完成后立即删除导出的 PDF，若因违规使用造成法律风险，责任由使用者自行承担。
