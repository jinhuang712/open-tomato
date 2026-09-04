export function CloudIcon(props: { class?: string; size?: number }) {
  const s = props.size ?? 14;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class={props.class}>
      <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8a4 4 0 0 1 0 10H7z" />
    </svg>
  );
}

export function SpinnerIcon(props: { class?: string; size?: number }) {
  const s = props.size ?? 13;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class={`spin ${props.class ?? ""}`}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function DownArrowIcon(props: { class?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class={props.class}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}
