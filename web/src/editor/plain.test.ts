import { expect, test } from "vitest";
import { textToHtml } from "./plain";

test("plain text becomes escaped paragraphs with line breaks", () => {
  expect(textToHtml("Hi <b>there</b>\nnext line\n\nNew para & more")).toBe("<p>Hi &lt;b&gt;there&lt;/b&gt;<br>next line</p><p>New para &amp; more</p>");
});

test("CRLF and whitespace-only blank lines still split paragraphs", () => {
  expect(textToHtml("a\r\nb\r\n \t\r\nc")).toBe("<p>a<br>b</p><p>c</p>");
});
