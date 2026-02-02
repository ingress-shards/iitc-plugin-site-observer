import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const webpack = require('webpack');
const { merge } = require('webpack-merge');

const baseDevConfig = require('iitcpluginkit/config/webpack.dev.js');

export default merge(baseDevConfig, {
    mode: 'development',
    devtool: 'eval-source-map',
    module: {
        rules: [
            {
                test: /\.js$/,
                enforce: "pre",
                use: ["source-map-loader"],
            },
        ],
    },
    output: {
        devtoolModuleFilenameTemplate: 'file:///[resource-path]'
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.APP_ENV': JSON.stringify('development'),
            'process.env.DATABASE_NAME': JSON.stringify('iitc_shards-observer-dev'),
            'process.env.CONFIG_BASE_URL': JSON.stringify('http://localhost:8080'),
        })
    ],
    ignoreWarnings: [/Failed to parse source map/],
});
