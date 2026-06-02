import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "World Cup 2026 API",
      version: "1.0.0",
      description: "Multi-tenant World Cup 2026 prediction game API.",
      license: { name: "ISC", url: "https://opensource.org/licenses/ISC" },
    },
    servers: [{ url: "http://localhost:3050", description: "Development server" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/routes/*.ts", "./src/controllers/*.ts", "./src/index.ts"],
};

export const specs = swaggerJsdoc(options);
export { swaggerUi };
