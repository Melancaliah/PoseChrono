import { describe, it, expect } from "vitest";
import { loadSharedModule } from "../../../helpers/load-shared-module.js";

const shared = loadSharedModule("packages/shared/dom-safety-utils.js");
// Module exports a factory function — call it to get the utils object
const domSafety = shared.createDomSafetyUtils();

describe("dom-safety-utils", () => {
  describe("escapeHtml", () => {
    it("devrait échapper les caractères HTML spéciaux", () => {
      expect(domSafety.escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
      );
    });

    it("devrait échapper les ampersands", () => {
      expect(domSafety.escapeHtml("a & b")).toBe("a &amp; b");
    });

    it("devrait échapper les guillemets doubles et simples", () => {
      expect(domSafety.escapeHtml('"hello"')).toBe("&quot;hello&quot;");
      expect(domSafety.escapeHtml("it's")).toBe("it&#39;s");
    });

    it("devrait échapper les chevrons", () => {
      expect(domSafety.escapeHtml("<b>bold</b>")).toBe(
        "&lt;b&gt;bold&lt;/b&gt;",
      );
    });

    it("devrait gérer null/undefined", () => {
      expect(domSafety.escapeHtml(null)).toBe("");
      expect(domSafety.escapeHtml(undefined)).toBe("");
    });

    it("devrait convertir les nombres en strings", () => {
      expect(domSafety.escapeHtml(42)).toBe("42");
      expect(domSafety.escapeHtml(0)).toBe("0");
    });

    it("devrait retourner une string vide pour une entrée vide", () => {
      expect(domSafety.escapeHtml("")).toBe("");
    });

    it("devrait être safe pour une injection de tag complet", () => {
      const input = '"><img src=x onerror=alert(1)>';
      const result = domSafety.escapeHtml(input);
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });
  });
});
