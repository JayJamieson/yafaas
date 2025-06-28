FROM node:22-slim

ENV FUNCTION_DIR=/var/task
ENV EVENT_ENDPOINT=host.docker.internal:9000

COPY scripts/entrypoint.sh entrypoint.sh
COPY scripts/bootstrap /var/runtime/bootstrap
COPY dist/index.mjs /var/runtime/index.mjs
COPY functions/index.mjs ${FUNCTION_DIR}/

WORKDIR ${FUNCTION_DIR}

ENTRYPOINT [ "/entrypoint.sh" ]
CMD [ "index.handler" ]
