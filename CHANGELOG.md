## [Unreleased]

### Added

- 增加“用户消失后 AI 主动关心”功能：仅对用户最新会话生效，按 12/24/48 小时三档触发并限制最多 3 次，用户一旦发言即重置。
- 服务端新增幂等与配置持久化：`idle_nudges` 用于去重与次数控制，`llm_settings` 用于保存每个用户的 LLM 配置（含轻量任务模型，API Key 加密存储），后台任务使用轻量模型生成台词；每轮扫描支持最大发送上限与轻量日志。
- 影响文件：`server/index.js`、`server/db.js`。
- 新增示例配置：`.env.example`（包含开关、限流、日志与 `LLM_SETTINGS_KEY` 说明）。
- VPS 一键部署/更新脚本增强：前端继续写入 `.env.production`，后端改为通过 `.env` + `dotenv-cli` 加载环境变量，支持新功能开关与加密密钥配置。
- 聊天交互优化：`/api/messages/append` 在 assistant 落库后回传最新好感度/阶段摘要，前端立即刷新显示与按钮状态，减少“AI 已回复但仍显示忙碌/阶段未更新”的延迟感。
