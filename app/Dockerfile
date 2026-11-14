FROM python:3.11-alpine
WORKDIR /app
COPY app.py .
COPY setup_keycloak.py .
COPY students.json .
RUN pip install --no-cache-dir flask requests python-jose pymysql boto3
EXPOSE 8081
CMD ["python", "app.py"]
