# TODO

- ~~organize into domain specific folders~~
  - ~~runtime~~
  - ~~api~~
- ~~add JSDoc where it matters. Probably just use typescript in the end ?~~
- port javascript runtime to typescript
- build function storage layer for logs
- build out eventbus service
  - handle events per function
- build out function manager service
  - ~~list functions~~
  - ~~delete functions~~
  - create functions
- put runtime to sleep after period of activity
  - start runtime when new request comes into gateway service
- how to scale to 1000 requests per second
