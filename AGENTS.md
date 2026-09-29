# VivaLaCrema Development Rules

## Project
- Next.js 16 App Router
- TypeScript
- Prisma 6
- PostgreSQL / Neon
- Vercel
- Tailwind CSS
- Recharts
- Currency: EUR

## Working Style
- Görevleri mümkün olduğunca baştan sona tamamla.
- Küçük değişikliklerde kullanıcıyı sürekli durdurma.
- Dosyaları kendin incele ve gerekli değişiklikleri yap.
- Mevcut mimariyi gereksiz yere değiştirme.
- Değişikliklerden sonra npm run build çalıştır.
- Build hatası varsa düzeltmeden görevi tamamlanmış sayma.
- Git diff ve git status ile yapılan değişiklikleri kontrol et.

## Git Safety
- Sadece görevle ilgili dosyaları stage et.
- git add . kullanma.
- Kullanıcının mevcut unstaged/untracked çalışmalarını değiştirme veya silme.
- Özellikle şu mevcut çalışmalara dokunma:
  - src/app/api/integrations/tillhub/webhook/route.ts
  - src/app/api/integrations/tillhub/payments/
- Commit atmadan önce değişiklikleri özetle.
- Push/deploy öncesinde kullanıcı onayı iste.

## Secrets
- .env ve .env.* dosyalarını commit etme.
- API token, database URL, password veya secret değerlerini çıktı olarak gösterme.
- TillHub, SumUp, Neon ve Vercel credential değerlerini değiştirme veya paylaşma.

## Database Safety
- Local ve production database'i birbirinden ayır.
- Destructive migration, deleteMany, DROP, reset veya production veri değişikliklerinden önce kullanıcı onayı iste.
- Production DB üzerinde test verisi oluşturma.
- DATABASE_URL hedefinin production/local olduğundan emin olmadan destructive işlem yapma.

## Accounting Rules
- TillHub satış verisi işletmenin satış/ciro kaynağıdır.
- SumUp işlemlerini tekrar satış geliri olarak sayma.
- SumUp ödeme işleme/settlement kaynağıdır.
- SumUp komisyonu giderdir.
- SumUp payout banka transferidir; gelir değildir.
- Aynı finansal hareketi iki kez sayma.
- Banka, nakit kasa ve SumUp bakiyelerini ayrı tut.
- totalLiquidity = bank + cash + SumUp.
- "Net Sonuç" yalnızca sisteme kaydedilmiş giderleri içeriyorsa bunu kesin muhasebe net kârı gibi sunma.

## Integrations
- Çalışan TillHub ve SumUp entegrasyonlarını gereksiz yere değiştirme.
- externalId/source duplicate korumasını muhafaza et.
- Entegrasyon değişikliklerinde duplicate kayıt riskini kontrol et.

## Quality
- TypeScript type safety koru.
- Para değerlerini UI'da EUR olarak formatla.
- Finansal hesaplamalarda floating-point gösterim hatalarını kullanıcıya yansıtma.
- API response'larında para değerlerini gerektiğinde 2 ondalığa yuvarla.
- Hardcoded ay/yıl metinlerinden kaçın; dönem bilgisini veriden üret.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
