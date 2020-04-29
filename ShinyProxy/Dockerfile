FROM arm32v7/adoptopenjdk:8-jre-hotspot-bionic

MAINTAINER Sergio Fernández "acsdesk@protonmail.com"

RUN mkdir -p /opt/shinyproxy/ && mkdir -p /var/log/shinyproxy && wget https://www.shinyproxy.io/downloads/shinyproxy-2.3.0.jar -O /opt/shinyproxy/shinyproxy.jar ## VERSION 2.2.1! ##
COPY application.yml favicon.png /opt/shinyproxy/

WORKDIR /opt/shinyproxy/
CMD ["java", "-jar", "/opt/shinyproxy/shinyproxy.jar"]
