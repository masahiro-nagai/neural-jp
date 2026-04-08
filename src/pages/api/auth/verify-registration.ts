export const prerender = false;
import { verifyRegistrationResponse } from '@simplewebauthn/server';

export async function POST({ request, cookies }: { request: Request, cookies: any }) {
    try {
        const body = await request.json();
        
        const expectedChallenge = cookies.get('registration_challenge')?.value;
        if (!expectedChallenge) {
            return new Response(JSON.stringify({ error: "チャレンジが見つかりません" }), { status: 400 });
        }

        const expectedOrigin = new URL(request.url).origin;
        const rpID = new URL(request.url).hostname;

        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin,
            expectedRPID: rpID,
        });

        if (verification.verified && verification.registrationInfo) {
            const { credential } = verification.registrationInfo;

            // Base64URL encode so it can be easily stored in Vercel ENV
            const base64CredentialID = Buffer.from(credential.id).toString('base64url');
            const base64PublicKey = Buffer.from(credential.publicKey).toString('base64url');

            cookies.delete('registration_challenge', { path: '/' });

            return new Response(JSON.stringify({ 
                verified: true,
                credentialID: base64CredentialID,
                publicKey: base64PublicKey
            }), { status: 200 });
        }

        return new Response(JSON.stringify({ error: "検証に失敗しました" }), { status: 400 });
    } catch (e: any) {
        console.error(e);
        return new Response(JSON.stringify({ error: `サーバーエラー: ${e?.message}` }), { status: 500 });
    }
}
