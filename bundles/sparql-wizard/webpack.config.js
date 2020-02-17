const path = require('path')

// Configurations shared between all builds 
const common = {
    mode: 'production',
    entry: './src/index.js',
    output: {
        filename: 'sparql-wizard.bundle.js',
        library: 'SparqlWizard',
        libraryExport: 'default',
    },
    devtool: 'source-map',
}

// Configurations specific to the browser build
const browser = {
    ...common,
    name: 'browser',
    output: {
        ...common.output,
        path: path.resolve(__dirname, 'dist', 'browser'),
        libraryTarget: 'umd',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                loader: 'babel-loader',
                exclude: /node_modules/,
            },
        ],
    },
}

// Configurations specific to the node build
const node = {
    ...common,
    name: 'node',
    output: {
        ...common.output,
        path: path.resolve(__dirname, 'dist', 'node'),
        libraryTarget: 'commonjs2',
    },
}


module.exports = [browser,node]



