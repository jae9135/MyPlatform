import { CONTACT_EMAIL, CONTACT_NOTICE, CONTACT_PHONE } from "@/lib/marketingCatalog";

type Props = {
  compact?: boolean;
  className?: string;
};

export function ContactInfo({ compact = false, className = "" }: Props) {
  return (
    <div className={`contact-info${compact ? " contact-info-compact" : ""}${className ? ` ${className}` : ""}`}>
      <p className="contact-info-notice">{CONTACT_NOTICE}</p>
      <ul className="contact-info-list">
        <li>
          e-mail:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
        <li>
          tel:{" "}
          <a href={`tel:${CONTACT_PHONE.replace(/-/g, "")}`}>{CONTACT_PHONE}</a>
        </li>
      </ul>
    </div>
  );
}
