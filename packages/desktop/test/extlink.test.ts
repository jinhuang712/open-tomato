import { describe, expect, test } from "bun:test";
import { shortenUrls } from "../src/renderer/extlink";

describe("shortenUrls", () => {
  test("带协议的裸 URL 压成域名胶囊", () => {
    expect(shortenUrls("<p>见 https://36kr.com/p/1721975406593。</p>")).toBe(
      '<p>见 <a class="ext-link" href="https://36kr.com/p/1721975406593" title="https://36kr.com/p/1721975406593">36kr.com</a>。</p>',
    );
  });
  test("没写协议、域名后有路径的也认，href 补 https", () => {
    expect(shortenUrls("<p>来源 36kr.com/p/1721975406593；界面新闻 jiemian.com/article/5852326.html</p>")).toBe(
      '<p>来源 <a class="ext-link" href="https://36kr.com/p/1721975406593" title="https://36kr.com/p/1721975406593">36kr.com</a>；界面新闻 <a class="ext-link" href="https://jiemian.com/article/5852326.html" title="https://jiemian.com/article/5852326.html">jiemian.com</a></p>',
    );
  });
  test("光一个域名、邮箱、正文里的点号不当链接", () => {
    for (const s of ["<p>饿了么 ele.me 起家</p>", "<p>写信到 a@b.com/x</p>", "<p>版本 1.2/3</p>", "<p>点评.com/首页</p>"]) {
      expect(shortenUrls(s)).toBe(s);
    }
  });
  test("已经是 <a> 的不重复套", () => {
    const s = '<p><a href="https://x.com/y">看这里</a></p>';
    expect(shortenUrls(s)).toBe(s);
  });
});
