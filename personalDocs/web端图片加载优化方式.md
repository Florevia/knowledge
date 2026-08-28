# 图片加载需要等几秒怎么优化？

| 方案                      | 用户看到的效果               | 适用场景              | 推荐度     |
| ------------------------- | ---------------------------- | --------------------- | ---------- |
| **骨架屏 Skeleton**       | 先显示灰色/占位区域          | 卡片、列表、Feed      | ⭐⭐⭐⭐⭐ |
| **Blur 模糊占位图**       | 先显示很模糊的小图，再变清晰 | 商品图、封面、大图    | ⭐⭐⭐⭐⭐ |
| **缩略图 → 原图渐进替换** | 先快速看到低清图，随后高清   | 大图片、详情页        | ⭐⭐⭐⭐⭐ |
| **Loading Spinner**       | 图片区域显示转圈             | 单张操作型图片        | ⭐⭐⭐     |
| **固定占位图**            | 默认图片 → 真图              | 头像、Logo            | ⭐⭐⭐⭐   |
| **渐显 Fade-in**          | 加载完成后淡入               | 几乎所有图片          | ⭐⭐⭐⭐   |
| **懒加载 Lazy Load**      | 快滚到图片时才加载           | 长列表、Feed          | ⭐⭐⭐⭐⭐ |
| **预加载 Preload**        | 用户看到页面前就提前请求     | 首屏 Banner、关键图片 | ⭐⭐⭐⭐⭐ |

## 骨架屏

```html
<div class="image-wrapper">
  <div class="skeleton"></div>

  <img src="xxx.jpg" onload="..." />
</div>
```

## Blur Placeholder

```
页面打开
   ↓
加载 2KB 极小缩略图
   ↓
立即显示模糊图片
   ↓
后台加载 2MB 高清图
   ↓
高清图加载完成
   ↓
模糊 → 清晰
```

特别适合：

- 商品图片
- AI 生成图片
  社交 Feed
- 图片详情页
- Banner
- 照片墙

例如：Next.js 的 `next/image` 组件

```tsx
<Image
  src="xxx.jpg"
  width={100}
  height={100}
  placeholder="blur"
  blurDataURL="data:image/png;base64,..."
/>
```

## 缩略图 → 高清原图

如果图片服务器能生成不同尺寸，更推荐真正做成：

```
thumbnail:
https://xxx.com/a.jpg?w=50

medium:
https://xxx.com/a.jpg?w=500

original:
https://xxx.com/a.jpg?w=2000
```

页面加载：

```
50px 小图
   ↓
500px / 1000px 正常图片
```

甚至可以渐进增强：

```
2KB
↓
30KB
↓
500KB
```

## Lazy Loading

## 图片格式和压缩

## Responsive Image

例如电脑需要 1200px 的图片，手机需要 400px 的图片，那么可以设置，让浏览器自己选择：

```html
<img
  src="800.jpg"
  srcset="400.jpg 400w, 800.jpg 800w, 1200.jpg 1200w"
  sizes="..."
/>
```

```
iPhone
→ 下载 400px

普通电脑
→ 下载 800px

Retina 大屏
→ 下载 1200px
```

## CDN + Cache

```
用户
 ↓
图片 CDN
 ↓
源服务器
```

推荐图片走：

```
CloudFront
Cloudflare CDN
阿里云 CDN
腾讯云 CDN
OSS CDN
AWS CloudFront
```

同时设置浏览器/CDN缓存.

例如资源文件hash化：

```
avatar.a83fd2.webp
```

然后：

```
Cache-Control: public, max-age=31536000, immutable
```
第二次访问就能直接：
```
Memory Cache / Disk Cache
```