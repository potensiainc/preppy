import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/app/_components/site-footer";
import { businessInformation } from "@/src/config/business-information";
import { privacyContent, termsContent } from "@/src/modules/legal/content";

describe("public business information", () => {
  it("shows the complete registered business information in the public footer", () => {
    const markup = renderToStaticMarkup(createElement(SiteFooter));

    expect(markup).toContain("사업자 정보");
    expect(markup).toContain(businessInformation.companyName);
    expect(markup).toContain(businessInformation.representative);
    expect(markup).toContain(businessInformation.registrationNumber);
    expect(markup).toContain(businessInformation.address);
    expect(markup).toContain(`mailto:${businessInformation.email}`);
    expect(markup).toContain(
      `tel:${businessInformation.phone.replaceAll("-", "")}`,
    );
  });

  it("matches the business information already published in legal documents", () => {
    for (const value of [
      businessInformation.companyName,
      businessInformation.representative,
      businessInformation.registrationNumber,
      businessInformation.address,
      businessInformation.email,
      businessInformation.phone,
    ]) {
      expect(termsContent).toContain(value);
      expect(privacyContent).toContain(value);
    }
  });
});
