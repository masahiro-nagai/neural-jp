export const prerender = false;
import { generateAuthenticationOptions } from '@simplewebauthn/server';

export async function POST({ request, cookies }: { request: Request, cookies: any }) {
    try {
        const rpID = new URL(request.url).hostname;
        
        const options = await generateAuthenticationOptions({
            rpID,
            userVerification: 'preferred',
        });

        cookies.set('authentication_challenge', options.challenge, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 300,
            path: '/',
        });

        return new Response(JSON.stringify(options), { status: 200 });
    } catch (e: any) {
        console.error(e);
        return new Response(JSON.stringify({ error: `サーバーエラー: ${e?.message}` }), { status: 500 });
    }
}
