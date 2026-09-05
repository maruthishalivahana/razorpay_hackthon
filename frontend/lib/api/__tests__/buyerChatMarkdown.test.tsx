import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMessage } from "@/components/buyer/MarkdownMessage";

describe("Buyer chat markdown rendering", () => {
    it("renders markdown formatting in assistant responses", () => {
        const html = renderToStaticMarkup(
            <MarkdownMessage content={"**Payment Successful!**\n\n- **Payment ID**: `pay_123`\n- **Order ID**: `order_456`"} />,
        );

        assert.match(html, /<strong[^>]*>Payment Successful!<\/strong>/);
        assert.match(html, /<li[^>]*><strong[^>]*>Payment ID<\/strong>:\s*<code[^>]*>pay_123<\/code><\/li>/);
        assert.match(html, /<ul[^>]*>/);
    });
});
