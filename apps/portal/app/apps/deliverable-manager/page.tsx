"use client";

import { PortalNav } from "@/lib/PortalNav";
import DeliverableApp from "@/lib/deliverable-manager/DeliverableApp";
import "./deliverable.css";

export default function DeliverableManagerPage() {
  return (
    <main>
      <PortalNav />
      <section className="hero">
        <h1>DeliverableManager</h1>
        <p>산출물 목록 테스트(공개 껍데기). 실제 문서는 회사 PC에만 있습니다.</p>
      </section>
      <DeliverableApp />
    </main>
  );
}
