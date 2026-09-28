export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function magicLinkFor(token: string): string {
  const scheme = process.env.APP_SCHEME ?? "movetogether";
  return `${scheme}://auth/verify?token=${encodeURIComponent(token)}`;
}

export async function deliverMagicLink(email: string, link: string): Promise<{ emailSent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!isProduction()) {
      console.info(`[magic-link] to=${email} link=${link}`);
    } else {
      console.error("[magic-link] RESEND_API_KEY is not set; refusing to expose the link in production");
    }
    return { emailSent: false };
  }

  const from = process.env.EMAIL_FROM ?? "Move Together <noreply@movetogether.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "무브 투게더 로그인 링크",
      text: `아래 링크를 눌러 로그인하세요.\n${link}\n이 링크는 잠시 동안만 유효해요.`,
    }),
  });
  if (!response.ok) {
    console.error(`[email] provider responded ${response.status}`);
    if (!isProduction()) {
      console.info(`[magic-link] to=${email} link=${link}`);
    }
    return { emailSent: false };
  }
  return { emailSent: true };
}
