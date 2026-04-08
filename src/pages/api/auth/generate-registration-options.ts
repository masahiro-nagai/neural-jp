export const prerender = false;
import { generateRegistrationOptions } from '@simplewebauthn/server';

export async function POST({ request, cookies }: { request: Request, cookies: any }) {
    try {
        const { password } = await request.json();
        if (password !== process.env.ADMIN_PASSWORD) {
            return new Response(JSON.stringify({ error: "パスワードが間違っています" }), { status: 401 });
        }

        const rpName = 'AI Tech Portal';
        const rpID = new URL(request.url).hostname;
        
        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: new Uint8Array(Buffer.from('admin-user')),
            userName: 'admin',
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'preferred',
            },
        });

        cookies.set('registration_challenge', options.challenge, {
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
