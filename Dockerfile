FROM node:18.18-slim

ENV FUNCTION_DIR /var/task

COPY scripts/entrypoint.sh entrypoint.sh
COPY scripts/bootstrap /var/runtime/bootstrap
COPY dist/index.mjs /var/runtime/index.mjs

WORKDIR ${FUNCTION_DIR}

ENTRYPOINT [ "/entrypoint.sh" ]
CMD [ "index.handler" ]
