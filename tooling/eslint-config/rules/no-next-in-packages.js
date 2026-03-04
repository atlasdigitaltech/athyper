// tooling/eslint-config/rules/no-next-in-packages.js
module.exports = {
    rules: {
        "no-restricted-imports": [
            "error",
            {
                paths: [
                    {
                        name: "next/headers",
                        message: "next/headers is only allowed inside Next.js apps"
                    },
                    {
                        name: "server-only",
                        message: "server-only must not be used in shared packages"
                    }
                ]
            }
        ]
    }
};
