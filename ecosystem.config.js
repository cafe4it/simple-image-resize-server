module.exports = {
    apps : [
        {
            name: "ali_seller_rating_server",
            script: "./app.js",
            watch: true,
            env: {
                "PORT": 5000,
                "NODE_ENV": "development"
            },
            env_production: {
                "PORT": 80,
                "NODE_ENV": "production",
            }
        }
    ]
}