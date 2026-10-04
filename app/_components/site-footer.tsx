import Link from "next/link";

import { businessInformation } from "@/src/config/business-information";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__intro">
          <p className="wordmark">PREPPY</p>
          <p>입학 준비에 필요한 정보를 공식 출처와 함께 정리해요.</p>
        </div>

        <section
          className="site-footer__business"
          aria-labelledby="business-info-title"
        >
          <h2 id="business-info-title">사업자 정보</h2>
          <dl>
            <div>
              <dt>사업자명</dt>
              <dd>{businessInformation.companyName}</dd>
            </div>
            <div>
              <dt>대표자</dt>
              <dd>{businessInformation.representative}</dd>
            </div>
            <div>
              <dt>사업자등록번호</dt>
              <dd>{businessInformation.registrationNumber}</dd>
            </div>
            <div className="site-footer__business-address">
              <dt>사업장 주소</dt>
              <dd>{businessInformation.address}</dd>
            </div>
            <div>
              <dt>고객 문의</dt>
              <dd>
                <a href={`mailto:${businessInformation.email}`}>
                  {businessInformation.email}
                </a>
              </dd>
            </div>
          </dl>
        </section>

        <div className="site-footer__meta">
          <nav aria-label="약관과 개인정보 안내">
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보 처리방침</Link>
          </nav>
          <p className="site-footer__copyright">© 2026 PREPPY</p>
        </div>
      </div>
    </footer>
  );
}
