package com.cccmbiz.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.util.Objects;

@Entity
public class Meal {
    @Id
    @Column(name = "id")
    private int id;

    @Column(name = "uid")           private String uid;
    @Column(name = "date")          private Date date;
    @Column(name = "start_time")    private Time startTime;
    @Column(name = "end_time")      private Time endTime;
    @Column(name = "deadline")      private Timestamp deadline;
    @Column(name = "type")          private byte type;
    @Column(name = "location")      private byte location;
    @Column(name = "name")          private String name;
    @Column(name = "price")         private BigDecimal price;

    @ManyToOne
    @JoinColumn(name = "event_id", referencedColumnName = "id", nullable = false)
    private Event eventByEventId;

    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    public String getUid() { return uid; }
    public void setUid(String uid) { this.uid = uid; }
    public Date getDate() { return date; }
    public void setDate(Date date) { this.date = date; }
    public Time getStartTime() { return startTime; }
    public void setStartTime(Time startTime) { this.startTime = startTime; }
    public Time getEndTime() { return endTime; }
    public void setEndTime(Time endTime) { this.endTime = endTime; }
    public Timestamp getDeadline() { return deadline; }
    public void setDeadline(Timestamp deadline) { this.deadline = deadline; }
    public byte getType() { return type; }
    public void setType(byte type) { this.type = type; }
    public byte getLocation() { return location; }
    public void setLocation(byte location) { this.location = location; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public Event getEventByEventId() { return eventByEventId; }
    public void setEventByEventId(Event e) { this.eventByEventId = e; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Meal m = (Meal) o;
        return id == m.id;
    }

    @Override
    public int hashCode() { return Objects.hash(id); }
}
