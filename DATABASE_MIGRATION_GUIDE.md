# 数据库迁移指南：从 SQLite 到 PostgreSQL

## 概述
项目已成功配置为使用 PostgreSQL 数据库。以下是完成迁移所需的步骤。

## 已完成的更改

1. **Prisma Schema 更新**
   - 数据源提供者从 `sqlite` 更改为 `postgresql`
   - 数据库 URL 从 `DATABASE_URL` 更改为 `POSTGRES_PRISMA_URL`

2. **数据库连接配置**
   - 简化了 `src/lib/db.ts` 中的连接配置
   - 现在直接使用 `POSTGRES_PRISMA_URL` 环境变量

3. **环境变量配置**
   - 更新了 `.env.example` 文件，将 PostgreSQL 作为主要数据库
   - 提供了 PostgreSQL 连接字符串示例

4. **迁移文件清理**
   - 删除了所有 SQLite 特定的迁移文件
   - 创建了新的 PostgreSQL migration_lock.toml

## 下一步操作

### 1. 设置环境变量
复制 `.env.example` 到 `.env` 并配置你的 PostgreSQL 连接：

```bash
POSTGRES_PRISMA_URL="postgresql://username:password@localhost:5432/gemini_balance?schema=public"
```

### 2. 创建数据库
确保你的 PostgreSQL 服务器正在运行，并创建数据库：

```sql
CREATE DATABASE gemini_balance;
```

### 3. 运行数据库迁移
使用以下命令创建初始迁移并应用到数据库：

```bash
# 如果使用 pnpm
pnpm prisma migrate dev --name init

# 如果使用 npm
npx prisma migrate dev --name init

# 如果使用 yarn
yarn prisma migrate dev --name init
```

### 4. 验证迁移
检查数据库中是否正确创建了以下表：
- `RequestLog`
- `ErrorLog`
- `Setting`
- `ApiKey`

## 数据迁移（如果需要）

如果你有现有的 SQLite 数据需要迁移到 PostgreSQL：

1. 导出 SQLite 数据
2. 转换数据格式（SQLite 到 PostgreSQL）
3. 导入到新的 PostgreSQL 数据库

## 部署注意事项

### Vercel 部署
- Vercel 会自动设置 `POSTGRES_PRISMA_URL` 当你连接 Vercel Postgres 数据库时
- 确保在 Vercel 项目设置中配置了正确的环境变量

### 其他平台部署
- 确保设置了 `POSTGRES_PRISMA_URL` 环境变量
- 确保 PostgreSQL 数据库可以从部署环境访问

## 故障排除

### 连接问题
- 检查 PostgreSQL 服务器是否正在运行
- 验证连接字符串中的用户名、密码、主机和端口
- 确保数据库存在

### 迁移问题
- 如果迁移失败，检查数据库权限
- 确保用户有创建表的权限
- 检查 Prisma 版本兼容性

## 回滚（如果需要）

如果需要回滚到 SQLite：

1. 恢复 `prisma/schema.prisma` 中的数据源配置
2. 恢复 `src/lib/db.ts` 中的连接配置
3. 恢复环境变量配置
4. 重新生成 Prisma 客户端

---

**注意**: 这个迁移是不可逆的，建议在生产环境中执行之前先在开发环境中测试。