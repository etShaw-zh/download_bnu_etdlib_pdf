# Edge 商店提交资料

版本：0.1.3。商店包与 GitHub 开发包分开构建，不支持本地 file:// 阅读器。商店包使用 zh_CN 为默认语言，名称和简短说明由 _locales/zh_CN/messages.json 提供。

生成：`python3 scripts/package_edge_store.py`

安装包：`output/edge-store/crow-pdf-edge-0.1.3.zip`（manifest.json 位于 ZIP 根目录）
商店 Logo：`output/edge-store/logo-300.png`
中文介绍：`docs/edge-store/listing-zh-CN.txt`
隐私政策：`docs/edge-store/privacy-policy.md`
公开政策 URL（该文件推送后可用）：https://github.com/etShaw-zh/download_bnu_etdlib_pdf/blob/main/docs/edge-store/privacy-policy.md
网站：https://github.com/etShaw-zh/download_bnu_etdlib_pdf
支持：https://github.com/etShaw-zh/download_bnu_etdlib_pdf/issues
类别建议：生产力。

## 单一用途

将用户已有权限阅读的北京师范大学学位论文图像页面整理为本地 PDF，用于个人学习和科研阅读。

## 权限理由

- activeTab：用户点击扩展后识别当前论文标签页，并向该页发送导出指令。
- storage：在浏览器本地会话存储中暂存论文标题、作者及任务状态，衔接详情页和全文阅读器；不使用云同步。
- https://etdlib.bnu.edu.cn/*：在该网站的详情页提取论文元数据，在支持的阅读器中滚动加载图像并生成本地 PDF。全文加载页和阅读器标签页的 URL 用于任务匹配。
- https://api.github.com/*：查询本项目公开的最新 Release 信息，提示新版本；不上传论文内容。

未使用远程代码。全部可执行代码随安装包提供。GitHub API 仅返回版本数据，论文网站请求仅用于页面图像。

## 数据披露说明

扩展处理网站内容，包括论文标题、作者及图像。作者姓名及论文地址仅暂存在本地浏览器会话中；PDF 本地生成。无开发者服务器上传、广告、分析追踪、数据销售或云同步。GitHub 与论文网站会收到完成请求所需的网络信息。

数据使用表格应披露网站内容；作者姓名若被表格归类为个人身份信息，也应如实披露其本地处理。按照当前表格的“收集/处理”定义填写，不能因为仅本地处理就默认勾选“未处理任何数据”。

## 审核测试说明（英文）

This independent extension exports image-based thesis reader pages from https://etdlib.bnu.edu.cn/ into a local PDF. It is not an official university product and does not bypass authentication or access controls. The thesis service may require an authorized account and/or an eligible network. No test credentials are included; reviewers should not assume that restricted full text is publicly accessible.

Open an accessible thesis detail page, then click the extension action and "开始加载并导出". The extension reads the title and author, clicks "查看全文", and continues exporting in the supported /read/pdfindex*.jsp reader. If the new tab is blocked, manually click "查看全文". Keep the reader tab in the foreground. The overlay shows loading/image-fetch progress; the generated file uses title_author.pdf. Starting directly in the reader is also supported. Existing pages must be refreshed after the extension is installed or updated.

The package has no remote executable code and no analytics. Public GitHub release metadata is fetched for update checks. Thesis content and PDF generation remain local. The current build passes 19 automated tests; full end-to-end export requires validation in an authorized live thesis session. If reviewers cannot access the restricted site, an authorized test environment or suitable demonstration may be required before certification.

## 官方依据

- 发布流程、隐私字段和素材规格：https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- 开发者注册：https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account

中文介绍按完整实际功能填写，Logo 使用现有原创图标。截图可选；没有加入合成或过时界面截图。

## 已提交记录

提交日期：2026-10-14。Partner Center 显示“正在审阅”。后台提示预计 7 个工作日收到反馈；此为预计时间，不代表已通过审核。

- 版本：0.1.3
- 类别：高效工作
- 可见性：公用；市场：全部可用市场
- 语言：中文（中国）
- Microsoft Store ID：0RDCKD6H6303
- CRX ID：epeblegeninhapoeihmfplkcimmdeanl
- 产品 ID：801d7fe3-db0e-4705-a629-72abed366f90
- 管理入口：https://partner.microsoft.com/zh-cn/dashboard/microsoftedge/801d7fe3-db0e-4705-a629-72abed366f90/packages/dashboard
- 商店公开链接：审核发布后由后台提供，尚未生成。

已上传精简权限的中文商店包、300×300 Logo 和中文说明，填写支持链接、隐私政策与权限理由，并向审核人员提供示例论文页面、测试步骤及访问限制。数据类别勾选个人身份信息、Web 历史记录、网站内容，以披露作者姓名、相关论文地址及页面内容的本地处理；未声明广告、数据销售、分析追踪或云同步。没有上传可选截图。

最终上传包的 19 项自动化测试通过，隐私政策公开链接返回 HTTP 200。真实授权环境下的整本论文下载验证仍待完成，认证说明已说明网站访问条件。
