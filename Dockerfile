# Set the base image
FROM node:5

# Author / Maintainer
MAINTAINER Covertness - wuyingfengsui@gmail.com

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY . /usr/src/app
RUN npm install --production

EXPOSE 8181 8181/udp 18181

RUN echo 'Starting Psychokinesis'
CMD ./bin/psychokinesis docker.psy -d 8181 -p 18181 -l 127.0.0.1