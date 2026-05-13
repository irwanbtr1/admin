export default function handler(req, res) {
    if (req.method === 'POST') {
        const { username, password } = req.body;

        if (username === 'admin' && password === '123') {
            return res.status(200).json({
                success: true,
                message: 'Login berhasil'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Username atau password salah'
        });
    }

    res.status(405).json({
        message: 'Method not allowed'
    });
}