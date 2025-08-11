## 本项目由 [jonthanliu/gemini-balance-nextjs](https://github.com/jonthanliu/gemini-balance-nextjs) 二次开发

### 相较于上游，本项目

- 完善、优化、精简了Vercel部署

- 重写了负载均衡

- 增加Redis支持

- 完善跨域访问

- 修复了一些bug（其中[params携带key](https://github.com/jonthanliu/gemini-balance-nextjs/pull/1)已提交pr）

### Vercel部署

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Dainsleif233/gemini-balance)

1. 点击按钮一键部署，第一次会失败

2. 在项目的Storage页面添加一个Neon和一个Upstash for Redis并绑定

3. 重新部署项目（不是新建一个项目），会自动迁移数据库和设置CRON密钥（默认是免费版的一天一次）

4. 配置自己的域名以自由访问