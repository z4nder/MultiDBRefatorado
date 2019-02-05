const { config } = require('dotenv');
const { join } = require('path');
const { ok } = require('assert')

const env = process.env.NODE_ENV || "dev"
ok(env === "prod" || env == "dev", "a env é invalida, ou dev ou prod")

const configPath = join(__dirname, '../config', `.env.${env}`)

config({
    path: configPath
})
const hapi = require('hapi');
const Context = require('./db/strategies/base/contextStrategy');
const MongoDb = require('./db/strategies/mongodb/mongodb');
const HeroiSchema = require('./db/strategies/mongodb/schemas/heroisSchema');
const HeroRoutes = require('./routes/heroRoutes');
const AuthRoutes = require('./routes/authRoutes');

const Postgres = require('../src/db/strategies/postgres/postgres');
const UsuarioSchema = require('../src/db/strategies/postgres/schemas/usuarioSchema');

const Inert = require('inert');
const Vision = require('vision');
const HapiSwagger = require('hapi-swagger');

const JWT_SECRET = process.env.JWT_KEY; //Chave secreta JWT
const hapiJwt = require('hapi-auth-jwt2');

const app = new hapi.Server({
    port: process.env.PORT
});

function mapRoutes(instance, methods) {    
    return methods.map(method => instance[method]())
};

async function main(){
    const connection = MongoDb.connect();
    const context = new Context(new MongoDb(connection, HeroiSchema));  

    const connectionPostgres = await Postgres.connect();
    const modelUsuario = await Postgres.defineModel(connectionPostgres, UsuarioSchema);
    const contextPostgres = new Context(new Postgres(connectionPostgres, modelUsuario));

    const swaggerOptions = {
        info: {
            title: 'API Herois  -#CursoNodeBR',
            version: 'v1.0'
        },
        lang: 'pt'
    }
    await app.register([
        hapiJwt,
        Vision,
        Inert,
        {
            plugin: HapiSwagger,
            options: swaggerOptions
        }
    ])

    app.auth.strategy('jwt', 'jwt', {
        key: JWT_SECRET,
       /* options: {
            expiresIn: 20
       }*/
       validate: async (dado, request) => {
           //Verificar no banco se o usuario continua ativo ou continua pagando
           const result = await contextPostgres.read({ //Define regras para um usuario valido
               username: dado.username.toLowerCase()               
           });
           if(!result) {
               return {
                   isValid:false
               }
           }
           return {
               isValid: true
           }
       }
    })

    app.auth.default('jwt') 
    app.route([        
        ...mapRoutes(new HeroRoutes(context), HeroRoutes.methods()),//Retorna rotas de heroRoutes
        ...mapRoutes(new AuthRoutes(JWT_SECRET, contextPostgres), AuthRoutes.methods())//Retorna rotas de AuthRoutes     
    ]);

    await app.start();
    console.log('Servidor rodando na porta', app.info.port);

    return app;
};

module.exports = main();
